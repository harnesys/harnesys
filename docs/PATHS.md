# PATHS — the single path contract

Authoritative spec for how file paths are represented and resolved across the platform.
Introduced to kill the `thread:` prefix dialect and the multiple anchoring rules that grew around it.
Before this doc, the same file could be addressed as `thread:attachments/a/x.png`, bare
`attachments/a/x.png` (ambiguous, resolved by an existence heuristic), an org-workspace-relative
path, or an absolute host path — with three independent resolvers that disagreed on jail semantics.

## 1. Fundamental rule

Every path string in the system is one of exactly two forms:

- **absolute host path** (`/...` after canonicalization: `path.resolve`, realpath where available), or
- **relative path anchored at exactly one root, defined by the entry-point surface** (table below).

No prefixes, no scheme markers, no per-string dialect tags (`thread:`, `org:`, `vf:` do not exist).
A relative path never changes meaning based on which files exist on disk.

## 2. Anchors per surface

| Surface | Relative anchor | Absolute paths |
|---|---|---|
| Runtime tools + shell (`packages/harnesys` packs, `file-guard`) | run `cwd` (= `primaryDirectory`) | canonicalized, gated by `FileAccessPolicy` (allow-roots, deny rules, ask) |
| Add-on host `files.stat/read/write` (server) | org workspace (`HostFsLayout.ensureOrgWorkspace`) | accepted, canonicalized + blocklist-checked; no policy jail (add-on host RPC is a host-side capability, documented) |
| REST thread-files (`/orgs/:orgId/threads/:threadId/files`, WebUI) | thread dir; any dot-free path under it (default `subPath` = root) | rejected |
| Source content REST (`/orgs/:orgId/sources/:sourceId/content`) | source root | rejected (path-jail) |
| DB storage columns (`attachments.path`, `issue_attachments.path`) | thread/issue dir, internal only — never handed to the model verbatim | n/a |

## 3. Thread mode: the thread dir is the run root

In thread mode (no workspace anchor, `cwd: 'thread'`), the run root is **the thread dir itself**
and the `threadDir/sandbox/` subdirectory concept is removed — the agent works directly in
`threadDir`:

- `primaryDirectory = threadDir`, for host and fleet workers. Writability of the working space
  comes from the primary-directory shortcut, not from a per-directory allow rule.
- Zones inside the thread dir: `attachments/` (read-only), `tool-outputs/` (read-only),
  `.runtime/` (invisible, denied); everything else is the agent's writable space.
- `threadDir/attachments/` and `threadDir/tool-outputs/` are inside the run root but **read-only**:
  `resolveFileAccess` must evaluate deny rules *before* the "inside primaryDirectory → allow"
  shortcut (deny wins), otherwise the primary-directory shortcut silently makes uploads editable.
- Derived rules carry only the zone pairs (`${threadDir}/attachments/**`,
  `${threadDir}/tool-outputs/**`, `${threadDir}/.runtime/**`); the former `${threadDir}/sandbox/**`
  allow pair is gone.
- The WorkspaceRef kind value `thread` is the internal mode name (contract, DB, enum) —
  renamed from `sandbox`; stored old values were rewritten by a one-time boot migration
  (`migrateWorkspaceModeSandboxToThread` in `apps/server/src/app/infra/org-sqlite/org-sql-migrations.ts`),
  not parsed at read time. User-facing surfaces say "Thread directory". Old threads' `sandbox/`
  directories stay on disk and appear as ordinary folders — no migration.
- Thread `policy.contextFiles` paths resolve against the run root (they moved with it); files
  under an old thread's `sandbox/AGENTS.md` are not migrated (user decision).
- Runtime debug artifacts (raw model request logs, compaction logs) live under
  `threadDir/.runtime/` and are invisible to the model: not listed in the runtime notes, hidden
  from a plain `ls` at the run root, and denied for both read and edit by the derived policy
  (deny wins over the primary-directory shortcut, so the pattern is `${threadDir}/.runtime/**`).

## 4. Persistence is absolute; live rendering is run-root-relative (AX rule)

Two layers, one rule each:

- **Persisted strings are ALWAYS absolute — the system never writes a relative path anywhere.**
  Message events, attachment parts, tool-result payloads (`path` fields, spill locator lines),
  `[file: ...]` fold inputs: all absolute canonical. Absolute is root-invariant (§1) and replays
  identically when the thread later switches anchors or a worker on another machine reads it.
  The server boundary (`send-thread-attachments`, group send, worker sync) always hands
  `join(threadDir, row.path)`; harnesys producers (`clip-tool-output`, `read-image`,
  `attachment-result`) persist the absolute path.
- **Relative paths exist only in two ephemeral places**: (a) per-request rendering of the prompt
  to the model — history sections rebuilt at call time (`fold-attachments` `[file: ...]`, image
  captions, runtime notes) rewrite an absolute path that is inside the current run root into a
  run-root-relative string via the single helper `displayPath(absolute, runRoot)`:
  `attachments/a1/x.png`, `read-image/y.jpg`, `tool-outputs/z.txt` in thread mode,
  absolute otherwise; and (b) the agent's own tool/shell calls, which the prompt teaches to use
  relative paths inside the run root (their echoes are the model's words, not system-produced
  locators). This is the token-saving mechanism; stored history stays unambiguous.

Where the run root is unknown to the renderer (add-on host RPC results, standalone runtime), the
rendered locator is absolute — safe default, still legal under §1.

Result fields that used to be named `relPath` and carried a prefixed locator are renamed `path`.
Echo-as-given fields (`write_file.path`, diff headers, etc.) keep echoing the input string
verbatim — no normalization of echoes.

## 5. No legacy

There is no legacy reader. Prefixed and `relPath`-era strings from pre-unification history are
inert: nothing in the codebase parses them, and old threads may fail to re-materialize their
media. The user accepted that outcome rather than keep compatibility readers.

Consequences per former consumer:

- `file-guard` (`packages/harnesys/src/adapters/actions/file-guard.ts`) anchors every tool input
  at the run `cwd` (§2). A copied `thread:sandbox/x.png` string resolves to a path whose name
  contains a colon, does not exist, and is denied or reported missing.
- `attachment-reader.resolveThreadPath` has two rules: absolute → `path.resolve`, relative →
  `path.join(cwd, …)`. The existence heuristic and the `attachments/`-under-`threadDir` fallback
  are gone.
- `captionLocatorOf` captures the trailing token as given (§1); the exclusion-map re-resolution in
  `llm.ts` runs the same two rules.
- `tool-message.parseFileToolResult` reads `path` only. A `relPath`-era payload yields no
  locator, so it never materializes as media and `microcompact.isMediaPayload` reports false for
  it: the JSON body is no longer exempt from clearing, so old image payloads lose their media
  permanently once a compaction pass fires.

No DB migration of `run_events` is performed; no migration is needed because nothing reads the
old forms. The legacy module `packages/harnesys/src/adapters/actions/legacy-thread-path.ts` is
deleted.

## 6. Add-on files service contract

- `files.stat/read/write` accept absolute or workspace-relative paths (§2). `thread:` is removed.
- New method `files.locate(scope)` → `{ path: string }` with the absolute root for
  `scope: 'thread' | 'workspace'`; `'thread'` requires a thread context (error otherwise).
  Add-ons that need to write into the thread dir compose absolute paths from it and call `write`.
- Results echo the anchor: absolute input → absolute output `path`; relative input →
  workspace-relative output `path`.

## 7. REST thread files

- Anchoring is the whole thread dir: `resolveThreadEntryPath` accepts any `..`-free relative path
  under `threadDir` whose every segment avoids a leading dot (dot-segment rejection covers
  `.runtime/` and dotfiles); absolute paths and NUL bytes are rejected. The default `subPath` is
  the thread root (`''`).
- Writes are allowed anywhere under the thread dir except first segments `attachments` and
  `tool-outputs` (read-only zones). `sandbox/`-prefixed paths are legal ordinary folders.
- `THREAD_FILE_ROOTS = ['attachments', 'thread', 'tool-outputs']` is the wire enum for
  `files-changed` root markers: `attachments`/`tool-outputs` map by first segment, `thread` is
  the marker for the writable thread space (renamed from `sandbox`; the markers are transient
  SSE payloads, nothing persists a `ThreadFileRoot`).

## 8. Canonical surface text

- Runtime notes (both host and worker, `llm.ts` + server runtime-prompt) must state, in this order:
  - "You are working inside `<run root>` (absolute)." — the run root is named once, prominently.
  - "Prefer relative paths for files inside the run root; absolute paths only for files outside
    it." (AX rule: shorter paths, fewer tokens, no ambiguity.)
  - Thread mode: "This is this thread's directory: everything in it is yours, except
    `attachments/` and `tool-outputs/` (read-only)."
  - Anchored runs: the thread dir is shown as an absolute path; everything in it is writable
    except `attachments/` and `tool-outputs/` (read-only); thread files are addressed by
    absolute path; outside the run root requires approval/rules.
- Tool descriptions drop "Paths starting with `thread:` ..." sentences entirely and, where a path
  param is described, mention "relative to the run root or absolute".
- Known gap: the fleet worker's `targets.resolve` (`work-executor.claimer.ts`) does not attach
  `runtime` yet, so the run-root note currently appears on host runs only.

## 9. Explicitly unchanged (not locators)

- WebUI Monaco model URIs (`file:///_threads/...`), tab/cache keys (`thread:<id>:<path>`,
  `thread-att:`), notification sound keys — UI-internal namespaces, never cross the wire.
- `HostFsLayout` physical roots (`threadDir` under `orgDir`, workspace under `orgDataDir`).
- `file_rules.pathPattern` absolute-glob patterns; `~` remains unsupported (rejected, not expanded).
- Thread-dir debug subdirs moved: `threadDir/raw-model-requests/` and `threadDir/compactions/`
  now live at `threadDir/.runtime/raw-model-requests/` and `threadDir/.runtime/compactions/`.
  Physical directories, not locators; old top-level dirs are not migrated (user decision, dev data).

## 10. Pass/fail markers for live verification

A thread run on the dev stand must show: the runtime notes print the run root once plus the
"prefer relative paths" rule; `read_file` on an uploaded attachment via the short relative path
rendered in the live prompt (`attachments/<attId>/<name>`) works; `edit_file` on `attachments/...`
is denied by policy while a root-level file (`root-check.md`) is writable; `file_read_image`
persisted result payload
`path` is absolute and contains no `thread:` substring, while the per-request rebuilt image
caption shows the run-root-relative form; a copied `thread:sandbox/...` string from old history
fails to resolve instead of opening; the persisted spill line ("Full output ... saved to") shows
an absolute path; the same attachment in an anchored run is rendered absolute already in the prompt;
`GET .../files?subPath=tool-outputs` returns the spill tree; `ls` at the run root shows
`attachments/`, `tool-outputs/` and the user's files (no `.runtime`); a `sandbox/`-prefixed path
stays a legal ordinary folder with nothing special about it; `read_file` on
`.runtime/raw-model-requests/<file>` is denied by policy; and nothing newly persisted into
run_events holds a relative system-produced locator.
