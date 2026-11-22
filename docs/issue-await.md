# Wait and signals: park a run until a signal settles

The core `wait` tool parks a run without graph nodes and resumes it into the same loop step:

- `wait({ delayMs })` — wall-clock sleep.
- `wait({ signal: 'issue:<issueId>' })` — resumes when the issue has no active execution.
- `wait({ signal: '<kind>:<id>' })` — any free-form key; the `signals` pack's `signal_fire`
  wakes it (agent-to-agent coordination).

A signal key is `'<kind>:<id>'`. Two resolution paths decide "settled":

1. **Registered resolvers** — state-derived kinds (`issue:` today). The resolver answers
   "settled?" from state, so a run that parks after the event still resumes.
2. **Signals store fallback** — any unregistered prefix looks up the org `signals` table
   (`key`, `fired_at`). `signal_fire` records the key (sticky) and wakes parked runs directly;
   a later park resumes on the next reconcile tick.

Unknown prefixes fall through to the store: an unfired key simply waits for the timeout —
fail-safe, never an error.

## Runtime

- A waiting run persists `wake_key` + `wait_fire_at` on the run row; the wait ticker
  (`apps/server/src/app/infra/runtime/wait-ticker.ts`, 1 s tick) reconciles: due timers and
  settled awaits resume through `resumeParkedRun`; `SignalWakePort.wake` →
  `LocalExecutorPort.wakeRuns` wakes instantly.
- `signal_fire` = `SignalStorePort.recordFire` + `SignalWakePort.wake` (packs/signals,
  ports `packages/harnesys/src/ports/signal-{store,wake}.ts`, adapters
  `infra/org-sqlite/signal-store.adapter.ts`, `infra/runtime/signal-wake.adapter.ts`).
- Timeout expiry resumes with `{ "timedOut": true }` (`onTimeout: continue`); a wake emits
  `wait.resumed` with `source: 'signal'`.
- `SignalToolsDeps` flows to the pack through the holder/provider pair
  (`packs/signal-tools.{holder,provider}.ts`), mirroring the issues pack.

## Adding a new signal kind

Free-form keys need nothing — fire and wait on any `kind:id`.

A state-derived kind (settled-ness derived from state, e.g. `approval:`) adds one entry in
`await-signal-resolvers.ts`: a resolver `{ prefix, isSettled(orgId, wakeKey) }` plus a wake
call in the producer that settles the state. The signals store fallback does not apply to
registered prefixes, so the state check stays authoritative.

Future direction: a generic event bus bridge could map domain events to wake keys
(`event → wakeKey`), removing the direct wake call; the resolver would still be required for
late parks.

## Issue waits (layer detail)

**Layer 1 — run wake (runtime).** A waiting run stores an opaque `wake_key` (`issue:<issueId>`,
format owned by `harnesys/src/domain/await-key.ts`). The wait ticker reconciles every waiting run with
a `wake_key` against the issue's latest execution (`IssueExecutionPort.findLatestByIssue`) and
resumes it through the same `resumeParkedRun` the timer path uses. The source of truth is state,
not a log: no signal table for state, no producer wiring, no park/release race; re-dispatch
during a tick simply keeps the wait pending.

**Layer 2 — domain event.** One producer, `releaseIssueExecution`
(`apps/server/src/app/application/issues/release-issue-execution.ts`), routes all four release
sites (local terminal, fleet ingest, cancel, reap), clears the worktree binding, and emits
`issue-execution-settled { issueId, runId, agentId }` on `IssueEventsPort`. `releaseByRunId` is
idempotent: an already-released execution returns `null` and emits nothing. Board rules, the UI
bridge, and future consumers (notifications, webhooks) subscribe to that event; the producer
never grows per-consumer branches.

## Surfaces

- `wait` tool (core, available to every agent): `wait({ signal: 'issue:<issueId>' })` parks the
  run immediately through the same interrupt path `ask_user` uses
  (`WaitInterrupt` → status `waiting` with a `wake_key` on the run row). Optional
  `timeoutMs` bounds the wait (default 30 min, `WAIT_AWAIT_TIMEOUT_DEFAULT_MS`); expiry resumes
  with `{ "timedOut": true }`. `wait({ delayMs })` parks the same way for a plain sleep.
  No graph nodes, no edges — existing agents need zero edits.
- `control:wait` node mode `awaitKey: '$state.awaitKey'` with a required `timeoutMs`
  (`wait_await_timeout` otherwise) stays as the graph-authoring surface; `delayMs`/`untilMs` are
  mutually exclusive with `awaitKey`. A wake emits `wait.resumed` with `source: 'signal'`; the
  timeout emits `source: 'timer'`, `timedOut: true`.
- Board rules: trigger `run_settled` and action `wake_agent` (`packages/contracts/src/boards.ts`).
  `assign_agent` is rejected on `run_settled` rules — a settled execution must not re-dispatch
  itself. `RunSettledRulesUseCase` subscribes to the settle event, applies
  labels/status/notifications, and wakes the named agents through `SignalWakePort` →
  `LocalExecutorPort.wakeRuns` → `wakeAwaitRuns`.

## Semantics

- Settled = latest execution exists and its state is not active (`released`). A missing
  execution row means dispatch has not reserved yet — not settled; the wait holds until the
  timeout. A deleted issue therefore falls through to the timeout.
- `needs_input` does not settle: the execution stays active while the worker asks a question.
- Free-form signal keys resolve through the signals store; registered prefixes stay
  authoritative for their kinds. A new state-derived trigger type is one resolver registration
  plus a wake call in its producer — no graph changes anywhere.
- Latency is bounded by the tick (≤ 1 s); registered kinds with a producer wake call resume
  instantly.

## Agent wiring

None required. The `wait` tool is core and self-parking: `wait({ signal: 'issue:<id>' })`
throws `WaitInterrupt`, the run parks at the tool-call node, and the wait ticker resumes it —
the same park/resume cycle as `ask_user`. Agents created before this change work unchanged.

The `issue-ops` skill documents the recipe and the new rule trigger/action.

## Diagnostics

`issue_get` shows `execution` only while it is active; `null` also means the run already
finished (released). Check `fireTrail` or the executor thread to distinguish "never dispatched"
from "already settled".
