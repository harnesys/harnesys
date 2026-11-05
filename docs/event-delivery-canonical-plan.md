# Event delivery: single-writer plan

Status: implementation-ready. Owner: server/runtime + web UI.

## Problem

The same run event can be published more than once on the org event stream. The old per-run SSE hid this with `seq <= lastSeq` filtering; `/api/events/watch` fans out every frame, so duplicate text deltas render as two agent bubbles.

Root causes, verified in code:

- `packages/harnesys/src/application/run-engine-segment.ts` `admit()` assigns `seq` and publishes immediately.
- `apps/server/src/app/infra/runtime/sqlite-run-events.adapter.ts` `append()`/`appendForThread()` publish the same events again from `onAppend` after commit.
- `packages/harnesys/src/application/run-engine-segment.ts` `guardedTransition()` tails the journal and publishes transition events; those are appended through `SqliteRunLifecycleStore` via `appendWithinTx`, which has no post-commit publisher.
- `packages/harnesys/src/application/run-engine.ts` child journal republishes after `appendForThread`.
- `apps/server/src/app/infra/fleet-hub/work-executor.ts` resume republishes via `tail()`.
- `apps/server/src/app/application/threads/send-thread-message.use-case.ts` emits the user message manually because it is written outside the run-event store.

## Target semantics

One committed run event = one publish, in process. For network delivery:

- stable identity: `(runId, seq)` for run events; `clientEventId` for conversational events;
- publish happens only after the transaction commits;
- journal is authoritative; live delivery may be lost on process crash and is healed by reconnect/resync;
- consumers apply events idempotently; the duplicate counter is expected to be zero in normal operation and is surfaced as a metric.

Do not add a dedupe layer as the primary fix. Keep idempotent application as defense in depth.

## Configuration

Add `delivery` to `OrgSettings` (`packages/contracts/src/org-settings.ts`):

```ts
delivery: {
  liveFlushMs: number;   // default 100, min 50, max 2000
  journalBatch: number;  // default 16, min 1, max 64
}
```

Defaults must be named constants in `packages/harnesys/src/constants.ts`:

- `DEFAULT_LIVE_FLUSH_MS = 100`
- `MIN_LIVE_FLUSH_MS = 50`
- `MAX_LIVE_FLUSH_MS = 2000`
- `DEFAULT_JOURNAL_BATCH = 16` (existing `JOURNAL_BATCH`)

The runtime resolves delivery settings per run from `OrgSettingsPort`, so changes apply to new runs without restarting the process.

SQLite write budget (measured locally, WAL + `synchronous=FULL`, 50 threads, 12 flushes each):

- batch 8: ~22k events/s, ~2.8k transactions/s
- batch 16: ~32k events/s, ~2.0k transactions/s
- projected worst case: 50 agents × 50 tok/s = 2,500 events/s; at 100 ms flush and 5 events per flush that is ~500 tx/s, well below measured capacity.

## Implementation phases

### Phase 1: server single writer

1. Add `onAppend` capability to `InMemoryRunEventStore` and `InMemoryRunLifecycleStore` so fleet workers keep a live stream.
2. Add a post-commit publisher to `SqliteRunLifecycleStore`:
   - capture events stored by `create()` and `transition()`;
   - call `onAppend(threadId, runId, stored)` only after the transaction resolves.
3. Wire one publisher instance in `org-run-stores.ts` for both the event store and lifecycle store.
4. Remove `admit()` publishing; it only assigns `seq` and returns the event.
5. Remove `guardedTransition()` tail publish.
6. Remove manual publish from `run-engine.ts` child journal and `work-executor.ts` resume.
7. Keep the existing `send-thread-message` user-event emit; user messages are a separate table and a separate event source. Document that.
8. Move `observeThreadErrors` to the post-commit publisher only.
9. Add delivery config plumbing:
   - `RunEngineDeps.delivery` or a getter for `DeliverySettings`;
   - `SegmentEnv` carries `journalBatch` and `liveFlushMs`;
   - `runSegment()` flushes when the batch is full, on tool boundaries, or when `liveFlushMs` elapsed;
   - `flushJournal` remains the only write path.
10. Add duplicate metrics in `createOrgEventPublisher`: count frames by `(runId, seq)` and log a warning when a duplicate is seen in development.

### Phase 2: web UI settings

1. Add `delivery` to the org settings contract and server validation.
2. Add a section in `apps/webui/src/features/manage-org-general/` next to time zone:
   - `Live flush interval` slider/input, 50–2000 ms, default 100;
   - `Journal batch` input, 1–64, default 16;
   - description: applies to new runs; lower is snappier, higher reduces SQLite writes.
3. Use `orgSettingsQuery` / `patchOrgSettings` like `org-timezone-section.tsx`.
4. Add English labels and test ids.

### Phase 3: verification

Server tests:

- `admit()` does not call the feed publisher;
- `append()` publishes once;
- `create()` with events publishes once;
- `transition()` with events publishes once;
- child journal publishes once;
- resume path publishes once;
- duplicate `(runId, seq)` is detected by the metric;
- lease-stale append publishes nothing.

Web tests/checks:

- duplicate dispatcher frame applies once and increments `duplicateFrames`;
- reconnect replay does not duplicate;
- org switch does not mix streams.

Manual:

- Telegram reply appears in one bubble;
- web send, stream, terminal, retry, HITL;
- cron/webhook/issue trigger;
- subagent in the same thread;
- second tab;
- offline/reconnect;
- server restart;
- settings change applies to the next run.

Gates:

- `bun test`
- `bun run --cwd apps/webui typecheck`
- `bun run --cwd apps/server typecheck`
- `bunx biome check` on changed files
- `bun run --cwd apps/webui build`
- `curl http://127.0.0.1:47474/health/ready` returns 200
- `grep` finds no direct `feed.publish` / `admit` publish for run events outside the single publisher

## Risks and closures

| Risk | Closure |
|---|---|
| transition events stop publishing | lifecycle `onAppend` after commit; dedicated test |
| fleet worker loses live stream | in-memory store sink; forwarder test |
| delta latency grows | `liveFlushMs` default 100, measured flush in `runSegment`, UI configurable |
| crash between commit and publish | journal + resync on reconnect; documented contract |
| duplicate still reaches clients | idempotent dispatcher + duplicate metric + test |
| settings change ignored | read settings per run; UI copy says "applies to new runs" |
| SQLite write amplification | batch config + measured budget above; flush only when pending |

## Out of scope

- Removing the old per-run SSE route (Stage 4 in `refactor.md`).
- Removing `run-finish` and the `refreshThread` early return (Stage 4).
- Changing ring sizes or resync UX (Stage 5).
