# Run Location Mechanism — Implementation Plan (rev. 2)

Status: approved design, pending implementation. Rev. 2 folds in the architecture review: two
artifacts (intent / decision) instead of one, explicit `inherit`, path guard policy, container
boundary rule, rollback analysis, consumer verification matrix, behavior-parity fixtures.

## Problem

Run directory resolution is spread over four mechanisms with conflicting precedence:

- Thread binding `runDirectory` (absolute path, `PATCH /threads/:id/binding`, locked after first run).
- Agent default `defaultRunDirectory` (absolute path, applied only at chat-thread creation).
- Per-run flat fields `sourceId`/`worktreeId` (issue workspace resolution, composer worktree store).
- Runtime-side precedence: `directory` unconditionally beats worktree (`bindingFor` in
  `org-runtime-runs.ts`, `resolveRuntimePrimary` in `prepare-runtime-input.ts:39-45`, node twin
  `work-executor.util.ts:65`).

Observed consequences: an issue worktree is silently overridden by a sticky thread directory; issue
threads never inherit the agent default; absolute paths break on other fleet hosts; waiting/restart
runs lose their binding (in-memory map); remote envelopes drop `triggerKind`, `branch`, `skills`;
placement ignores source readiness. Additionally, arbitrary run paths are unguarded today
(`agent.helpers.ts:96-105` checks only `startsWith('/')`; `update-thread-binding.use-case.ts:81-84`
only `isAbsolute`; `prepare-org-target.ts:155-160` grants write roots without ownership checks) —
a path can point into another org's data or this org's `org.db`.

## Design principles

Industry-proven pipeline: **declarative intent → resolved decision → host-side materialization**
(the k8s spec/kubelet and plan/apply shape). Three properties make it future-proof:

1. **One resolver.** Composition, validation, and decision happen in a single pure function on the
   relay at dispatch time. Execution never re-decides; it only materializes.
2. **The persisted artifact is the decision, not the intent and not the physical state.** Intent
   lives in configs (thread/agent), the decision lives on the run row, physical paths are derived
   at claim time on the executing host (host materializations change; a frozen physical path goes
   stale; a derived one is always current).
3. **Extension points are explicit.** A new location kind, a new layer, or a new placement
   constraint is an additive change to one union / one compose rule / one constraints builder —
   never a new mechanism.

## Core model

### WorkspaceRef — intent (held by configs and request bodies)

```ts
type WorkspaceRef =
  | { kind: 'inherit' }                                       // follow the next layer down
  | { kind: 'sandbox' }                                       // explicit private thread dir
  | { kind: 'source'; sourceId: string; subpath?: string }
  | { kind: 'worktree'; sourceId: string; worktreeId: string; subpath?: string }
  | { kind: 'folder'; hostId: string; path: string };         // raw dir outside orgs-root
```

- Thread layer: `inherit` | `sandbox` | fixed ref — the three UI states "Use agent default /
  Sandbox / Fixed workspace". `inherit` replaces the old null-as-not-set ambiguity.
- Agent layer: default = fixed ref or unset (unset → sandbox). A `worktree` ref is rejected for the
  agent default at save time (worktrees are ephemeral, branch-scoped — a default would rot); the
  type stays permissive, validation is layer-aware and explicit.
- Run layer: produced by the request (composer per-run pick, issue workspace resolution) or absent.

### RunEnvironment — decision (one JSON column on `runs`, host-independent)

```ts
interface RunEnvironment {
  anchor: { sourceId: string; worktreeId?: string } | null;
  subpath?: string;                 // applied only when same source as anchor (I2)
  branch?: string;                  // context only (prompt, issue checkout plan)
  cwd: 'sandbox' | 'anchor';        // 'sandbox' + anchor != null = mount-only (container case)
  provenance: 'run' | 'thread' | 'agent' | 'fallback';
}
```

Persisted once at dispatch. No `trigger_kind`/`branch` columns needed — the trigger's effect is
already baked into `cwd`. In-flight runs without `environment` (upgrade window) re-resolve
deterministically from thread ref → agent default → sandbox, identical to today's behavior.

### Physical materialization — derived at claim, one implementation

Pure function `(RunEnvironment, host state) -> { cwd, allowRoots, writeRoots, mounts, workspaceKey,
promptContext }`. Both relay runtime and node call the same domain code; the divergent
`prepareTarget`/`prepareWorkerTarget` twins collapse into one derivation plus thin adapters
(`SourceLocationPort` on the relay, the node's layout adapter).

### Invariants (the whole mechanism on one page)

- **I1 Layer order**: run > thread > agent > sandbox; `inherit` makes a layer transparent.
- **I2 Same-source subpath**: subpath is taken from the highest layer whose ref references the
  same `sourceId` as the winning anchor; no composition across different sources or onto `folder`.
- **I3 Resolve once**: dispatch produces `RunEnvironment`; claim only materializes.
- **I4 Anchor drives placement**: worktree/folder → host pin (existing `sourceConstraints`
  mechanism); source → `requiredSources: [sourceId]`; `sourcesReady` comes from materializations,
  not a hardcoded `true`.
- **I5 Access**: assigning a location to a run, a thread, or an agent's default workspace is an
  explicit grant — the anchor is always reachable by that run, and the org workspace (the managed
  `Workspace` source) is shared with every agent. `agent.sharedSourceIds` governs *additional*
  sources an agent may open through tools, not the workspace it was given. `folder` paths are
  subject to the I6 guard; roots granted to the run come from the materialized environment.
- **I6 Path guard**: `folder` paths must be outside the orgs data root (`<dataRoot>/orgs`) and
  system roots; anything inside is reachable only through source/worktree anchors. Closes the
  cross-org / `org.db` write hole; no registry entity required (a named-folder registry remains a
  future ergonomic layer on top of the same kind).
- **I7 Container boundary**: container isolation requires a non-sandbox anchor; `workspaceKey` is
  the anchor identity (`worktree:<id>` / `source:<id>@<host>`, unchanged from
  `workspace-target.ts:60-72`); sandbox-anchored container runs are a validation error instead of
  today's silent host fallback.
- **I8 Source-only chat**: `source` anchor + non-issue run → `cwd: 'sandbox'` (mount only) —
  preserved behavior, now an explicit field instead of trigger-branch logic in the runtime.

### Use-case coverage

| # | Use case | Covered by |
|---|----------|------------|
| 1 | Whole registered source | `{source}` |
| 2 | Subfolder of a source (monorepo) without registering sub-sources | `{source, subpath}` |
| 3 | Issue branch isolation | `{worktree}` from issue workspace resolution |
| 4 | Subfolder inside a worktree | I2 composition |
| 5 | Arbitrary directory outside sources, pinned host | `{folder, hostId}` |
| 6 | Agent default applied everywhere unless overridden | thread `inherit` + agent layer |
| 7 | Explicit "sandbox" vs "follow default" | `sandbox` vs `inherit` |
| 8 | Visible provenance | `RunEnvironment.provenance` |
| 9 | Fleet placement aware of location reality | I4 |
| 10 | Restarts / waiting / re-place keep the decision | `runs.environment` column |
| 11 | Access control | I5, I6 |

## Phase 1 — Contracts and shared seam (merges first)

New `packages/studio-shared/src/workspace-ref.ts` (pure):

```ts
type WorkspaceLayer = { origin: 'run' | 'thread' | 'agent'; ref: WorkspaceRef | null };
interface ResolvedEnvironment { environment: RunEnvironment }
function resolveEnvironment(layers: WorkspaceLayer[]): ResolvedEnvironment   // I1, I2, I8
function describeEnvironment(environment: RunEnvironment, names: NameLookup): string
```

New `packages/contracts/src/workspace-ref.ts`: `WorkspaceRefSchema`, `RunEnvironmentSchema`
(zod discriminated unions), re-exported from `domains-work.ts`.

Contract edits (all additive; old clients keep working):

- `packages/contracts/src/thread.ts:159` `UpdateThreadBindingBodySchema`: add `workspaceRef`;
  refine — `workspaceRef` and `runDirectory` are mutually exclusive.
- `packages/contracts/src/thread-runs.ts:38` `SendThreadRunBodySchema`: add `workspaceRef`;
  refine — `workspaceRef` XOR the `sourceId`+`worktreeId` pair.
- Agent create/patch/summary contracts: `defaultWorkspaceRef` (nullable); `defaultRunDirectory`
  stays accepted, deprecated.
- `ThreadSummary` / `ThreadPublic`: add nullable `workspaceRef`; `runDirectory` becomes read-only,
  deprecated for one release.
- `packages/contracts/src/fleet-secrets.ts:51-72` `TaskEnvelopeSchema`: add optional
  `environment`, `skills`, `expiresAt` (additive; old nodes ignore unknown fields; legacy
  `directory`/`sourceId`/`worktreeId` remain populated for one release for version skew).

## Phase 2 — Server core (zone A)

- New `apps/server/src/app/domain/thread/run-environment.ts` (pure): subpath containment via
  `path.relative` (`..`, absolute, escaping anchor → error); orgs-root guard for `folder` refs
  (I6); `materializeEnvironment(environment, hostState)` — the single derivation used by relay and
  node. Domain imports nothing.
- Rewrite `resolveRuntimePrimary` (`prepare-runtime-input.ts`) as a thin wrapper over
  `materializeEnvironment`; the triggerKind branch disappears (I8 is baked into `environment.cwd`).
  Rewrite `prepare-runtime-input.spec.ts`, `prepare-org-target.runtime.spec.ts`, and add the
  behavior-parity fixture spec (see Tests).
- New `apps/server/src/app/application/threads/resolve-run-environment.ts`: ports `threads`,
  `agents`, `sources`, `worktrees`, `sourceLocation`, `layout`, `machineConfig`. Loads layers
  (run ref from the body — including the flat-field mapping; thread ref — legacy `runDirectory`
  mapped on read; agent ref), calls `resolveEnvironment`, validates: source exists and is in
  `agent.sharedSourceIds` (absorbs `send-thread-worktree.ts:23-24`); worktree exists / `ready` /
  source matches (`:26-32`); folder path exists on the stamped host (I6 guard); subpath containment
  against the resolved anchor root. Output: `RunEnvironment` + resolved anchor metadata for
  placement. Typed, actionable errors. `send-thread-worktree.ts` is deleted (all callers are in
  `send-thread-run.use-case.ts`).
- `send-thread-run.use-case.ts` / `send-thread-dispatch.ts:31-42`: shared fields become
  `{ environment, ...isolation }`; `thread.runDirectory` is no longer read here. Placement input
  becomes the environment's anchor.
- Issue path:
  - `update-issue.use-case.ts:92-135` — `fireAssignee` is rewritten onto `dispatchIssueExecution`
    (input assembly as in `nudge-issue.use-case.ts:84`); ad-hoc reserve/activate removed.
  - `fire-issue.use-case.ts:20-27` — `workspaceRefs` produces the run-layer ref (`{worktree}` when
    bound, `{source}` for the checkout plan, none when unbound); `ensureThread` (`:226`) keeps
    the thread ref empty (inherit by absence).
  - Unbound issue: run layer empty → thread `inherit`/empty → agent default → sandbox.
  - Blocked (branch without source): unchanged.
- `update-thread-binding.use-case.ts`: accepts `workspaceRef`; for `folder` without `hostId` —
  validate existence and stamp `hostId = machineConfig.get().id`; I6 guard at save; the
  lock-after-first-run rule is kept.
- `create-thread.use-case.ts:79` — thread ref stays empty instead of seeding the agent default
  (the agent layer is a runtime fallback).

## Phase 3 — Persistence (zone B)

- Schema: `org-sqlite/schema/threads.ts` + `workspace_ref TEXT`; `schema/agents.ts` +
  `default_workspace_ref TEXT`; `schema/runs.ts` / `org-sql.ts:596-624` + `environment TEXT`
  (single JSON column — decision + provenance; no trigger/branch columns).
- Migrations per house pattern (`org-sql-migrations.ts:7-21`), wired in `org-sql-ensure.ts`.
- `thread-repository.adapter.ts:102,314` — read: parse `workspace_ref`; when NULL map legacy
  `run_directory` via `mapLegacyDirectory`: path equals a source materialization `localPath` →
  `{source}`; under a root → `{source, subpath}`; otherwise → `{folder}` hostless (transitional;
  dispatch on a host without the directory fails explicitly, as today). Writes go to
  `workspace_ref`; dual-write rule below.
- `agent-registry.adapter.ts:24,175,224` — same mapping for `defaultRunDirectory` →
  `defaultWorkspaceRef`.
- `packages/harnesys/src/ports/run-lifecycle-store.ts:37-44` — `RunCreateInput` and `RunRecord`
  gain `environmentJson?: string`; `sqlite-run-lifecycle.adapter.ts:31` maps the column;
  `packages/harnesys/src/application/session.ts:177` passes it into `lifecycle.create`.

Cascade deletion of the in-memory binding map: `bindingFor` / `syncThreadBinding` /
`worktreeBindings` out of `org-runtime-runs.ts:42,56,74-135`, `org-runtime.ts:46,61,126,217,253,264,346`,
`org-runtime-run-target.ts:42,64`, `org-run-stores.ts:36,59`, `org-runtime-queue.ts:29,52`,
`ThreadBinding` from `workspace-target.ts:11-18`. `resolveRunTarget`
(`org-runtime-run-target.ts:64`) reads `environment` from `lifecycle.get(runId)`;
`sessionFor` (`org-runtime.ts:212`) prepares with the thread-level ref (no run exists yet; the
per-run environment always overrides). Branch display (`runtime-prompt.ts:69`) reads
`environment.branch`; branch seeding is event-driven (`branch-state-seed.ts`) and needs no change.

Pending placements: `schema/pending-placements.ts` + `environment TEXT` + migration;
`issue-waiting-run.use-case.ts:127-148` payload carries the environment and `expiresAt` (fixes
drops No. 4-6 of the field-drop audit).

## Phase 4 — Placement and fleet (zone C)

- `resolve-run-placement.ts`: input = environment anchor (replaces `worktreeHostId`);
  worktree/folder → host pin (existing `sourceConstraints` at `:78`); source →
  `requiredSources: [sourceId]`; line 56 `sourcesReady: true` becomes real readiness from
  `SourceMaterializationPort` (ready hosts ∩ candidate nodes). `decidePlacement` already accepts
  both mechanisms — only the population is new.
- `issue-remote-run.use-case.ts` `buildRemoteEnvelope:251-283`: emit `environment` plus legacy
  `directory`/`sourceId`/`worktreeId` derived from it (one release, fleet version skew), plus
  `skills`, `expiresAt`; `deferUntilSnapshotReady:181-218` forwards the full payload including the
  honest `trigger`.
- `place-pending-run.use-case.ts` `buildEnvelope:134-173` — same mapping from the waiting payload;
  `placeLocally:80-85` unchanged — resumes resolve from the run row.
- Node: `infra/fleet-hub/work-executor.util.ts:58-115` — `prepareWorkerTarget` drops the divergent
  `directory ?? worktreeRoot ?? sandbox` precedence and calls the shared
  `materializeEnvironment` with the node's layout adapter; falls back to legacy envelope fields
  when `environment` is absent (old relay).

## Phase 5 — WebUI (zone D)

- `shared/api/threads.ts:307-316` — `updateThreadBinding` sends `workspaceRef`; `:69` maps it;
  `send-message.ts:47-56` sends `workspaceRef` instead of `sourceId`/`worktreeId`;
  `thread-worktree.store.ts` holds a `WorkspaceRef`; `source-worktrees-panel.tsx:30` updates it.
- `thread-binding-bar.tsx:233-308` — three thread states (Use agent default / Sandbox / Fixed);
  fixed ref options: sources with in-tree browsing (FolderBrowser scoped to the materialization
  root emits `{source, subpath}`; a pick outside sources emits `{folder}`, hostId stamped
  server-side); chip label and provenance via `describeEnvironment` + the shared resolver run over
  thread/agent layers.
- `agent-execution-pane.tsx:117-193` — default workspace picker (sandbox / source tree with
  subfolders / folder outside orgs-root) writes `defaultWorkspaceRef`; legacy value displayed via
  the mapping.
- Issue drawer (`issue-worktree-card.tsx`, `issue-vcs-panel.tsx`): "Next fire will run in
  \<anchor (+ composed subpath)>" — composed client-side via the shared resolver; no new server GET.
- Automations trigger target (`trigger-target-field.tsx:135-139`) switches from
  `linkedThread.runDirectory` to `linkedThread.workspaceRef`.
- No manual `useMemo`/`useCallback`; all visible text in English.

## Phase 6 — Cleanup (separate next release, gate: fleet rollout complete)

Remove legacy envelope fields, flat `sourceId`/`worktreeId` from `SendThreadRunBody`, and the
`run_directory` / `default_run_directory` columns after backfill verification (guard pattern of
`org-sql-guards.ts`). Out of scope here. A named-folder registry ("Legacy server", "Shared data")
is a future ergonomic layer over the `folder` kind — the model needs no change for it.

## Consumer verification matrix

| Consumer | Impact | Mechanism |
|---|---|---|
| System add-ons (triggers → `IssueFirePort`) | none | fire contract unchanged; flat fields mapped to the run layer |
| Add-on thread creation (`AddonThreadCreateInput` — `agentId/title/kind` only) | none | no dir fields exist; gains agent default via runtime fallback |
| Add-on runs (`AddonRunInput`) | none | no dir fields |
| Automations UI binding | additive | `workspaceRef` on summary; legacy mapped on read |
| Old WebUI during deploy window | compatible | server maps `runDirectory` ⇄ `workspaceRef`; refines reject only combined sends |
| Old relay → new node / new relay → old node | compatible | envelope dual fields for one release |
| Branch seeding | none | event-driven (`branch-state-seed.ts`); prompt branch from `environment.branch` |
| Knowledge / skills autoload | none | keyed by `scope.sourceIds` (`sharedSourceIds`), unchanged |
| File-access rules, permissions, approvals, HITL, compaction, steering | none | consume `paths`/lifecycle, shapes unchanged |
| Attachments | none | remain a separate thread artifact (out of the workspace model) |
| Run snapshots / ask-resume | additive | node resume rebuilds from envelope (persisted; `environment` added) |
| Context files, runtime prompt | none | consume the derived `cwd` |

## Rollback and compatibility

- New code dual-writes legacy columns during the transition: `run_directory` = flattened absolute
  path when derivable (source/folder anchors → `anchorRoot + subpath`; sandbox → NULL; worktree →
  NULL, matching today's non-persistence); `default_run_directory` is never erased.
- Rollback = redeploy the previous binary: old code ignores `workspace_ref`/`environment` and reads
  legacy columns. Degradation is bounded and explicit: subpath pins degrade to absolute hostless
  paths (today's semantics), worktree issue runs re-resolve via issue workspace at fire time (old
  behavior). No data loss, no dead threads.
- Contract refines reject only combined old+new sends, which no existing client produces.

## Tests (9, `bun test`, colocated)

1. `studio-shared/workspace-ref.spec.ts` — precedence matrix; `inherit` transparency; same-source
   subpath composition; different-source no-compose; folder no-compose; I8 mapping.
2. `domain/thread/run-environment.spec.ts` — subpath containment; orgs-root guard; materialization
   derivation table (anchor/cwd → cwd/roots/mounts/key).
3. `application/threads/resolve-run-environment.spec.ts` — unshared source; not-ready worktree;
   stale worktree ref; folder host validation; provenance; legacy thread fallback.
4. Thread repository adapter legacy mapping — root → source, under root → source+subpath,
   external → folder hostless.
5. `prepare-runtime-input.spec.ts` — parity fixture: preserved scenarios produce identical cwd to
   the legacy resolver (chat+path; chat bare → sandbox; issue+worktree; issue+source; chat+source
   container → sandbox cwd; schedule → sandbox).
6. `resolve-run-placement.spec.ts` — worktree/folder host pin; `requiredSources`; `sourcesReady`
   from materializations.
7. Envelope golden roundtrip — `buildRemoteEnvelope` → node materialization → identical `cwd`.
8. Migration spec — columns added, legacy rows mapped (pattern of `migrate-usage-table.spec.ts`).
9. Rollback dual-write spec — legacy columns populated per the dual-write rule.

## Behavior-change ledger (for review)

- Thread directory no longer overrides an issue worktree (the original defect).
- Issue threads inherit the agent default; an unbound issue runs in the agent default instead of
  the sandbox.
- `fireAssignee` goes through workspace resolution like every other fire path.
- Waiting / restart / re-place runs keep their environment; stale bindings are impossible.
- Placement accounts for source readiness and folder host pinning.
- chat + source-only (container) keeps the sandbox as cwd — I8, intentional.
- Arbitrary paths inside the orgs data root are rejected (security fix; legitimate inner paths are
  reachable via source/worktree anchors).
- Container isolation with a sandbox anchor is a validation error instead of a silent host run.
- Out of scope: group threads (sandbox only, unchanged), node-side branch checkout automation,
  named-folder registry (future layer), node filesystem browsing in UI (future; `hostId` already
  in the model).

## Execution order

Seam (Phase 1) → zone A → zones B/C/D in parallel (disjoint files; the B/C seam is fixed: the
`environment` column on `runs` and `pending_placements`, `RunCreateInput.environmentJson`).
Per-agent gates: boot on its own port with its own `DEV_HARNEYSYS_HOME`, `tsc --noEmit`,
`biome check`, zone specs. Final: one review pass over the whole diff, one consolidated fix pass.

## Implementation notes (rev. 3)

Decisions taken while implementing, all reflected in the code:

- **Isolation is part of the persisted decision.** `RunEnvironment` carries `isolation: { mode,
  image? }`; it is attached at dispatch from the placement decision and read at claim time. Without
  it a container-profile run would silently degrade to a host run after a restart or a waiting
  re-place. The park-approval file runtime reads `runtime` from the same resolved environment.
- **I8 applies to run-layer source refs.** A `source` ref at the run layer (issue checkout plan)
  runs with `cwd: 'anchor'` only for issue runs and with `cwd: 'sandbox'` for every other trigger
  (mount-only). Thread- and agent-layer source refs always run with `cwd: 'anchor'`: they are an
  explicit "work here" choice, not a checkout plan.
- **Physical materialization stays claim-time.** Only the logical `RunEnvironment` is persisted; the
  node derives `cwd`/roots through the shared `materializePrimary` with its own source-location
  adapter. The former node twin precedence is gone; legacy envelopes still fall back to the old
  fields for version skew.
- **Legacy projection never erases.** Dual-write writes `run_directory` / `default_run_directory`
  only when the ref is representable as a path (source/folder); worktree, sandbox and inherit refs
  leave the legacy column untouched so a rollback keeps its last value.
- **The issue location belongs to the issue, not to the agent.** An issue always resolves to a
  concrete workspace: its explicit `sourceId` (with an optional `branch`, materialized as a worktree
  when one exists) or, when it has none, the managed organization `Workspace`. The run/thread/agent
  precedence is unchanged, but the issue's location is passed as the run layer on every fire and on
  every manual message in its thread, so all agents the issue is handed to work in the same folder
  and relative links stay valid across handoffs. The issue source picker has no empty state: the
  managed workspace is shown as the default issue source, and the issue tools describe the rule.
  `issue.workspace_subpath` scopes the run to a subfolder of that source (any source, including
  git); the directory is created on the first run on the relay or node, and the issue card offers
  `issues/<id>` as a one-click suggestion. The subfolder travels in `WorkspaceRef`, so placement,
  envelopes and the node materializer need no special cases.
- **Assignment grants access (I5 revised).** A source accepted as the run/thread/agent workspace is
  always accessible to that run; sharing a source under Access only adds that source to the agent's
  tool reach. This removes the contradiction where an issue worktree assigned to an agent (directly
  or by a board workflow) failed dispatch because the source was not in `sharedSourceIds`, and it
  makes the org `Workspace` (managed, implicitly shared) selectable as any agent's default.
- **Folder guard protects both roots** (`<home>/orgs` with `org.db` and `<home>/data/orgs`) plus a
  system-root denylist. Subpath validation is lexical (relative, no `..`), so remote-only sources no
  longer require a relay-side materialization to validate a dispatch.
- **`fireAssignee` awaits `dispatchIssueExecution`**, so reservations are synchronous with the
  patch and failures surface instead of being dropped.
- **Known deprecated-window gap:** `manage-thread-members/ui/thread-context-files.tsx` still gates
  on `thread.runDirectory`; for source/worktree pins the legacy column is NULL by design, so that
  pane degrades until the cleanup release removes the legacy field.
