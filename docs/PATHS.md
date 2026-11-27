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
| REST thread-files (`/orgs/:orgId/threads/:threadId/files`, WebUI) | thread dir; roots whitelisted `attachments`, `sandbox`, `tool-outputs` | rejected |
| Source content REST (`/orgs/:orgId/sources/:sourceId/content`) | source root | rejected (path-jail) |
| DB storage columns (`attachments.path`, `issue_attachments.path`) | thread/issue dir, internal only — never handed to the model verbatim | n/a |

## 3. Sandbox mode root change (the B decision)

In sandbox mode (no workspace anchor, `cwd: 'sandbox'`), the run root is **the thread dir itself**:

- `primaryDirectory = threadDir` (was `threadDir/sandbox`), for host and fleet workers.
- `threadDir/sandbox/` stays the conventional writable scratch subdirectory; the runtime notes
  describe it as the relative path `sandbox/` under the run root.
- `threadDir/attachments/` and `threadDir/tool-outputs/` are inside the run root but **read-only**:
  `resolveFileAccess` must evaluate deny rules *before* the "inside primaryDirectory → allow"
  shortcut (deny wins), otherwise moving `primaryDirectory` up silently makes uploads editable.
- Derived rules keep their exact patterns (`${threadDir}/attachments/**`, `${threadDir}/sandbox/**`,
  `${threadDir}/tool-outputs/**`); only the precedence changes.
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
  `attachments/a1/x.png`, `sandbox/read-image/y.jpg`, `tool-outputs/z.txt` in sandbox mode,
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

- `THREAD_FILE_ROOTS = ['attachments', 'sandbox', 'tool-outputs']` (was missing `tool-outputs`,
  which the prompt promised the model).
- Writes remain restricted to `sandbox/**` (unchanged rule, now reads also cover tool-outputs).

## 8. Canonical surface text

- Runtime notes (both host and worker, `llm.ts` + server runtime-prompt) must state, in this order:
  - "You are working inside `<run root>` (absolute)." — the run root is named once, prominently.
  - "Prefer relative paths for files inside the run root; absolute paths only for files outside
    it." (AX rule: shorter paths, fewer tokens, no ambiguity.)
  - Sandbox mode: "This is this thread's directory: `attachments/` (uploaded files, read-only),
    `sandbox/` (scratch, writable), `tool-outputs/` (spill, read-only)."
  - Anchored runs: the thread dir is shown as an absolute path; thread files are addressed by
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
is denied by policy while `sandbox/...` is writable; `file_read_image` persisted result payload
`path` is absolute and contains no `thread:` substring, while the per-request rebuilt image
caption shows the run-root-relative form; a copied `thread:sandbox/...` string from old history
fails to resolve instead of opening; the persisted spill line ("Full output ... saved to") shows
an absolute path; the same attachment in an anchored run is rendered absolute already in the prompt;
`GET .../files?subPath=tool-outputs` returns the spill tree; `ls` at the run root shows only
`attachments/`, `sandbox/`, `tool-outputs/` (no `.runtime`); `read_file` on
`.runtime/raw-model-requests/<file>` is denied by policy; and nothing newly persisted into
run_events holds a relative system-produced locator.
