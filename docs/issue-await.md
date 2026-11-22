# Issue await: park a run until a dispatched issue settles

`wait` was a wall-clock sleep only, and parking on an issue required a dedicated `issue_await`
tool plus a hand-configured `control:wait` node in the agent's graph. A coordinator that
dispatched work through an issue board had to guess a sleep duration; a run that finished in
2 minutes left the coordinator sleeping for the full timeout. Now the core `wait` tool parks
the run on a signal (`signal: 'issue:<issueId>'`) and the run resumes as soon as the issue has
no active execution — no graph edits for any agent, present or future.

## Two layers

**Layer 1 — run wake (runtime).** A waiting run stores an opaque `wake_key` (`issue:<issueId>`,
format owned by `harnesys/src/domain/await-key.ts`). The wait ticker
(`apps/server/src/app/infra/runtime/wait-ticker.ts`, 1 s tick) reconciles every waiting run with
a `wake_key` against the issue's latest execution (`IssueExecutionPort.findLatestByIssue`) and
resumes it through the same `resumeParkedRun` the timer path uses. The source of truth is state,
not a log: no signal table, no producer wiring, no park/release race; re-dispatch during a tick
simply keeps the wait pending.

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
  labels/status/notifications, and wakes the named agents through `IssueWakePort` →
  `LocalExecutorPort.wakeRuns` → `wakeAwaitRuns`.

## Semantics

- Settled = latest execution exists and its state is not active (`released`). A missing
  execution row means dispatch has not reserved yet — not settled; the wait holds until the
  timeout. A deleted issue therefore falls through to the timeout.
- `needs_input` does not settle: the execution stays active while the worker asks a question.
- Unknown `wake_key` namespaces resolve to "not settled" (`await-signal-resolvers.ts` is a
  prefix registry; `approval:`/`job:` land as new registrations later). A new trigger type is
  one resolver registration plus a signal format — no graph changes anywhere.
- Latency is bounded by the tick (≤ 1 s). Instant wake can be added later as a subscriber on
  `issue-execution-settled` without moving the `wake_key` contract.

## Agent wiring

None required. The `wait` tool is core and self-parking: `wait({ signal: 'issue:<id>' })`
throws `WaitInterrupt`, the run parks at the tool-call node, and the wait ticker resumes it —
the same park/resume cycle as `ask_user`. Agents created before this change work unchanged.

The `issue-ops` skill documents the recipe and the new rule trigger/action.

## Diagnostics

`issue_get` shows `execution` only while it is active; `null` also means the run already
finished (released). Check `fireTrail` or the executor thread to distinguish "never dispatched"
from "already settled".
