# Thread History: Loading, Sync, and Pagination Plan

Status: Phase 0 is implemented. Phases 1-3 are planned and not implemented.

Scope: how a thread's history is read from SQLite, delivered to the web UI, reconciled into the
client store, and rendered. This document is the single source of truth for the follow-up work.

Line numbers are from `v0.10.25` plus the Phase 0 patch. Always trust the symbol name over the
line number.

This revision (2026-11-23, rev3) incorporates the second review pass. Changes against rev2 are
marked **[rev3]** inline where they alter behavior. The two architectural changes are:

- **Deletion journal replaces `log_epoch`.** A new `thread_log_deletions` table records every
  destructive write as a `(from, to)` range in the same transaction, so any client heals a
  deletion precisely (drop the range, re-sync the delta) instead of dropping its whole window.
  `thread_seq` is never reused and `run_events` is append-only (`update(runEventsTable)` has zero
  matches server-side), so the journal is a complete invalidation model.
- **No coarse `reset` on the common path.** Sync and resync are chunked cursor loops; the client
  only falls back to a tail reload when the deletion journal exceeds a hard cap (pathological,
  not normal use).

## 1. Problem

Opening a thread with a big history could take up to two minutes. The behavior is dominated by one
unbounded read model and two quadratic client functions, repeated on every run completion and SSE
reconnect.

Measured on the live home (`~/.harnesys/orgs/33992cb5-.../org.db`, 133 710 `run_events` rows):

| Step | Largest thread |
| --- | --- |
| SQL read + row mapping | 62-156 ms |
| `projectThreadEvents` | 27 ms |
| JSON response | 5-13 ms, max 2.4 MB |
| `coalesceStreamDeltas` + `reconcileSnapshot` + `feedUpdate` | 1.5-9 ms |
| `fillSeenAt` before Phase 0 | 109 ms at 1 399 events |

Synthetic scaling before Phase 0 (`fillSeenAt` / `reconcileSnapshot`):

| Projected events | `fillSeenAt` | `reconcileSnapshot` |
| --- | --- | --- |
| 2 000 | 207 ms | 64 ms |
| 5 000 | 1.21 s | 204 ms |
| 10 000 | 5.37 s | 916 ms |
| 20 000 | 20.7 s | 3.25 s |
| 40 000-50 000 | ~85-130 s | ~13-21 s |

At 40-50k projected events the client alone reaches the observed "up to two minutes". On the
current database the largest projected history is 1 399 events, so the cliff is not reproduced with
today's data; it appears as soon as one thread accumulates tens of thousands of non-delta events
(tool calls, usage rows, many text blocks).

What was ruled out:

- SQLite indexes: `run_events` PK is `(thread_id, thread_seq)`
  (`apps/server/src/app/infra/org-sqlite/schema/run-events.ts:31-42`).
- Server projection: it shrinks 26 454 rows to 1 399 events and 42 079 rows to 488 events
  (`apps/server/src/app/application/threads/thread-events-projection.ts:109-121`).
- Rendering: chat renders a 12-run window (`apps/webui/src/widgets/chat-transcript/ui/thread-panel.tsx:60,162`,
  `apps/webui/src/widgets/chat-transcript/model/tail-slice.ts:10-25`), and "Load earlier" only
  re-slices the in-memory log today.

Root causes:

1. The read model is a full, unbounded snapshot: `GET /threads/:id` calls
   `listByThread` (`apps/server/src/app/application/threads/get-thread.use-case.ts:44`,
   `apps/server/src/app/infra/runtime/sqlite-run-events.adapter.ts:186-192`) and returns every
   event.
2. The same snapshot is reloaded after every terminal run event and on every SSE open:
   `apps/webui/src/features/send-message/model/thread-events.ts:109,136-147`,
   `apps/webui/src/features/desk/ui/desk-sync.tsx:105-121,156-195`,
   `apps/webui/src/features/desk/model/refresh-thread.ts:8-45`.
3. Up to eight threads are mounted and loaded at once
   (`apps/webui/src/widgets/chat-transcript/ui/chat-transcript.tsx:88`,
   `apps/webui/src/shared/config/constants.ts:22`).
4. Two client functions were quadratic:
   - `fillSeenAt` spread a growing object per key (`apps/webui/src/entities/session/model/event-keys.ts:46-67`).
   - `reconcileSnapshot` scanned the whole snapshot per local stream slot
     (`apps/webui/src/entities/session/model/reconcile-snapshot.ts:49-66,104-137`).

Two additional root causes found in review, fixed by this revision: **[rev3]**

5. The org-wide thread-event stream (`watchThreadEvents`, `apps/webui/src/shared/api/events.ts:46-63`)
   feeds **every** thread of the org into the client store (`thread-events.ts:52-58`), so events
   accumulate for threads the user never opened and `resyncThreadEvents` re-downloads every thread
   that ever emitted an event (`thread-events.ts:27-39`).
6. `DeleteThreadEventUseCase` reads the **whole** log just to find the target row
   (`delete-thread-event.use-case.ts:49-52`), defeating the "small mutation" goal on the delete path.

## 2. Product target

From a user's point of view:

- Any thread opens with the same latency regardless of history size.
- A finished run, a return to the tab, or an SSE reconnect never reloads the whole thread and never
  moves the scroll position.
- "Load earlier" feels local: the first clicks expand an already loaded page instantly; only a page
  boundary costs a network round trip. A prefetch hides even that. Returning to the tail resets the
  render window to the tail, so the DOM never grows past a bounded window. **[rev3]**
- The unread separator, the compaction divider, the fork separator, deleting a message, undoing a
  compaction, and re-running an issue task are always accurate.
- Pages show complete turns. A turn is never cut in half, including turns with spawned agents.
- Multi-tab and multi-device stay consistent: a delete or an undo in one window is healed in the
  other immediately (an SSE invalidation frame), and on the next sync or resync without reopening
  the thread. **[rev3]**
- A spawn tab opened from an old page, or restored from the persisted IDE workspace, still shows the
  spawn's full transcript.
- The thread files section in the inspector is not limited to the loaded window.
- A working day with many opened threads does not grow memory without bound: history windows are
  budgeted and evicted, and threads without an opened window keep only a small capped tail for the
  sidebar status. **[rev3]**
- Live streaming never competes with history loading on the main thread.

Non-goals:

- No chat virtualization. The 12-run render window plus pages is enough; the render window resets
  when the user returns to the tail.
- No polling. One-off fetches on user action or SSE events only.
- No agent context changes. Context seeding keeps using the engine path (see 3).
- No changes to export, add-ons, or the legacy integration zones.
- No server-side thread search (Phase 3 idea only).

## 3. Invariants

- Server layering: `api -> application -> domain`, `infra` implements domain ports. A use case
  never imports an infra module (`AGENTS.md`, "Layer Direction").
- DI tokens are value imports. Never `import type` a class used as a token. After adding a
  controller, use case, port, adapter, or module, boot the server and wait for a successful boot.
- Application modules do not import infra modules; infra modules are global and exported
  (`apps/server/src/app/infra/thread/thread.module.ts:18-40` is the precedent).
- The engine owns agent context. `RunEventStore.listByThread` and `branch-state-seed` stay untouched
  (`apps/server/src/app/infra/runtime/branch-state-seed.ts:83,133,151`).
- **Projection is pure per slice.** `projectThreadEvents` must return the same events for a slice as
  the full log restricted to that slice. No whole-input state. The only whole-input rule today
  (`dropSupersededStats`) moves to the client store.
- **A page never contains part of a run.** Pages are fetched by run id (root run plus its descendant
  runs), not by a raw thread_seq interval, because spawned runs interleave in the same `run_events`
  stream (`packages/harnesys/src/application/run-engine.ts:132-163`). Root runs are sequential:
  `runs_active_root_idx` permits one active root per thread and a parent is awaited by its spawns
  before it terminates (`graph.ts:2035` `spawnOutcome = await spawnPromise`), so root-run starts are
  safe page boundaries.
- **The client cursor only moves to a value the server confirmed**: a sync `cursor`, a mutation
  response `cursor`, or a live event's `threadSeq`. After a truncation the client cursor moves back
  down to the server's new `MAX(thread_seq)` — this is a server-confirmed value, not a heuristic.
  **[rev3]**
- **Every destructive write records a deletion range** in `thread_log_deletions` in the same
  transaction, so any client can detect and apply a removal below or at its cursor precisely.
  `run_events` rows are never updated in place and `threads.last_thread_seq` is never rewound, so a
  range is complete and unambiguous. **[rev3]**
- **Windowed read routes never 404 an old client.** The legacy full route stays for one release as a
  degraded-tail compatibility shell (section 6.9). The new client falls back to the legacy route on
  a 404 from the windowed routes (section 6.4). **[rev3]**
- Deletion is cascading: a removed symbol removes its branches, callers, re-exports, tests, and docs
  in the same change.
- No runtime feature flags. One release per phase; each phase is a sequence of revertable commits
  that contain both the client and the server side for the behavior they change. **[rev3]**
- Import/export sites: `packages/contracts/src/thread.ts`, `packages/contracts/src/domains-work.ts:300-322`,
  `apps/webui/src/shared/api/index.ts`, `apps/webui/src/entities/session/index.ts`.

## 4. Phase 0 (implemented)

Committed as `84643e7` on branch `threads-impr`. Behavior-preserving optimizations. Do not redo,
do not revert without a reason.

- `apps/webui/src/entities/session/model/event-keys.ts:46-67`: `fillSeenAt` now builds the result
  object once instead of spreading the accumulating object per key.
- `apps/webui/src/entities/session/model/reconcile-snapshot.ts:55-95`: snapshot rows are indexed by
  stream identity once (`slotRowsOf`), and `overlapOf` only walks the matching identity rows.

Measured after Phase 0:

| Scenario | Before | After |
| --- | --- | --- |
| `fillSeenAt`, 20k events | 20.7 s | 6 ms |
| `reconcileSnapshot`, 20k events | 3.25 s | 15 ms |
| Real thread, 1 399 events | ~130 ms | ~20 ms |

Gates run: `bun test src/entities/session/model` in `apps/webui` (39 pass),
`bun run typecheck` in `apps/webui` (app + server configs), `bunx biome check` on the two files.
No new tests were written.

## 5. Phase 1: incremental sync

Goal: stop downloading and reconciling the full thread after a run and on regular reconnects.
UX is unchanged; the network payload drops from megabytes to kilobytes for the events that were not
already delivered over SSE.

Phase 1 does not bound the client-side log for **opened** threads: `feedUpdate` still rebuilds the
whole loaded log (`apps/webui/src/entities/session/model/feed/feed-engine.ts:124-125` on
`decisions === null`). That is Phase 2's job. Do not claim main-thread improvements in Phase 1
acceptance. **[rev3]**

### 5.1 Deletion journal (shared by Phases 1-2)

A monotonic invalidation model with per-thread precision. Replaces the rev2 `threads.log_epoch`
counter entirely: no `ALTER TABLE` migration, no `logEpoch` in the summary or contract.

- Schema: new table in `apps/server/src/app/infra/org-sqlite/org-sql.ts` (next to `CREATE_RUNS_SQL`),
  created with `CREATE TABLE IF NOT EXISTS` so existing org DBs get it on boot with no migration
  function:

  ```sql
  CREATE TABLE IF NOT EXISTS thread_log_deletions (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    from_thread_seq INTEGER NOT NULL,
    to_thread_seq INTEGER NOT NULL,  -- 0 = open-ended through the end of the thread
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (thread_id, from_thread_seq)
  );
  CREATE INDEX IF NOT EXISTS thread_log_deletions_thread_idx
    ON thread_log_deletions(thread_id);
  ```

  `to_thread_seq = 0` is the "open-ended" sentinel (a `thread_seq` is always >= 1, so `0` is safe).
  A single-row removal records `(X, X)`; a truncation records `(X, 0)`.
- Drizzle schema mirror in `apps/server/src/app/infra/org-sqlite/schema/thread-log-deletions.ts`
  (`threadLogDeletionsTable`), so the port can query it without raw SQL.
- Domain type `ThreadLogDeletion = { from: number; to: number }` in
  `apps/server/src/app/domain/thread/thread-history-page.port.ts`.
- Record the range **inside** the same transaction as the delete, before returning:
  - `truncateThreadEvents` (`apps/server/src/app/infra/runtime/sqlite-thread-truncate.ts:34-101`):
    after deleting rows, `INSERT INTO thread_log_deletions (thread_id, from_thread_seq,
    to_thread_seq, deleted_at) VALUES (?, ?, 0, ?)`.
  - `removeThreadEventRow` (`sqlite-thread-truncate.ts:75-101`): `INSERT ... VALUES (?, ?, ?, ?)`
    with `to_thread_seq = threadSeq`.
  Undo compaction already flows through `removeThreadEventRow`
  (`apps/server/src/app/infra/runtime/truncate-thread-state.ts:31-48`), so it is covered.
- `threads.last_thread_seq` is **not** rewound by truncation. That is deliberate: thread seq stays
  monotonic, so a cursor never collides with a re-used seq, and a deletion range is unambiguous.
  Do not "fix" it.

### 5.2 Contract

Add to `packages/contracts/src/thread.ts` after `ThreadPublicSchema` and export from
`packages/contracts/src/domains-work.ts` next to `ThreadPublicSchema`:

```ts
export const THREAD_SYNC_MAX_EVENTS = 5_000;
export const THREAD_SYNC_MAX_DELETIONS = 500;

export const ThreadSyncQuerySchema = z.object({
  afterThreadSeq: z.coerce.number().int().nonnegative(),
});
export type ThreadSyncQuery = z.infer<typeof ThreadSyncQuerySchema>;

export const ThreadLogDeletionSchema = z.object({
  from: z.number().int().positive(),
  to: z.number().int().nonnegative(), // 0 = open-ended
});
export type ThreadLogDeletion = z.infer<typeof ThreadLogDeletionSchema>;

export const ThreadSyncResponseSchema = z.object({
  summary: ThreadSummarySchema,
  events: z.array(z.unknown()),
  cursor: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  deletions: z.array(ThreadLogDeletionSchema),
  reset: z.boolean(),
});
export type ThreadSyncResponse = z.infer<typeof ThreadSyncResponseSchema>;
```

- `cursor` is the thread's current maximum `thread_seq` **after** the read (or the max of the
  returned rows when the read raced an append). The client sends it as the next `afterThreadSeq`.
- `hasMore: true` means the delta was capped at `THREAD_SYNC_MAX_EVENTS` and the client must send
  another sync with the returned `cursor`. The client loops until `hasMore === false`; the loop is
  bounded by the finite distance to `serverMax` and, for a terminal thread, terminates because no
  appends happen after the read. **[rev3]**
- `deletions` is the complete list of deletion ranges for the thread (they are few: one per
  destructive action). The client drops the intersecting ranges from its loaded log. When the list
  exceeds `THREAD_SYNC_MAX_DELETIONS`, the server returns `reset: true, deletions: [], events: []`
  and the client reloads the tail page once — the only coarse reset left, and only for a
  pathological deletion count, never for size. **[rev3]**
- `events` is always the projection of the delta rows with `projectThreadEvents`. The projection is
  slice-pure (section 3).
- `projectThreadEvents` loses `dropSupersededStats` (`thread-events-projection.ts:95-107`) in this
  phase: a delta cannot know the global last stats row. The client keeps exactly one `model.stats`
  via `normalizeThreadEvents` (section 5.4), which also covers the full-snapshot path. The server
  projection spec case for stats is deleted with the logic.

Endpoint: `GET /orgs/:orgId/threads/:threadId/sync?afterThreadSeq=N`.

### 5.3 Server

New domain port `apps/server/src/app/domain/thread/thread-history-page.port.ts`:

```ts
export interface ThreadLogDeletion {
  from: number;
  to: number; // 0 = open-ended
}

export interface ThreadSyncSlice {
  rows: SessionEvent[];
  serverMax: number;
  deletions: ThreadLogDeletion[];
}

export abstract class ThreadHistoryPagePort {
  abstract syncSlice(
    orgId: string,
    threadId: string,
    afterThreadSeq: number,
    limit: number,
  ): Promise<ThreadSyncSlice>;
  abstract waitingForProfileId(orgId: string, threadId: string): Promise<string | undefined>;
}
```

Phase 2 extends this port with `listPage`, `listRange`, `listRunSubtree`, `listToolEvents`
(section 6.3). Keeping one port avoids a second SQLite read path. There is no `listTail` method: the
tail page is `listPage` (Phase 2), and nothing needs a raw tail read in Phase 1. **[rev3]**

- `waitingForProfileId` queries the last 50 rows of type `placement.decided` or `wait.started`
  (`SELECT type, metadata FROM run_events WHERE thread_id = ? AND type IN ('placement.decided','wait.started') ORDER BY thread_seq DESC LIMIT 50`)
  and runs the existing pure `waitingForProfileIdFromEvents` rule over them
  (`thread.helpers.ts:329-350`). Do not take only one row: a `placement.decided` that already has a
  `selectedNodeId` makes the rule continue to older rows. A plain 200-row tail can miss the marker
  under a long stream.
- New adapter `apps/server/src/app/infra/thread/thread-history-page.adapter.ts`:
  - `@Injectable() export class ThreadHistoryPageAdapter extends ThreadHistoryPagePort`.
  - Constructor `(private readonly layout: HostFsLayoutPort)`.
  - Reuse `withOrgSqlite` (`apps/server/src/app/infra/org-sqlite/org-sqlite-session.ts:56-67`) and
    the existing row mapping `joinedRows` / `rowsToEvents`
    (`apps/server/src/app/infra/runtime/run-events-append.ts:25-40`). Do not duplicate JSON parsing.
  - `syncSlice` runs **one** `withOrgSqlite` callback and reads, in order: `serverMax =
    MAX(thread_seq)` (0 when empty), the delta rows
    (`thread_id = ? AND thread_seq > ? ORDER BY thread_seq LIMIT ?`), and `deletions` = all rows of
    `thread_log_deletions` for the thread. One session means one consistent snapshot: a truncation
    cannot land between `serverMax` and the delta rows. **[rev3]**
  - `waitingForProfileId`: as above, its own `withOrgSqlite` call.
  - Register in `apps/server/src/app/infra/thread/thread.module.ts:21-38` as
    `{ provide: ThreadHistoryPagePort, useClass: ThreadHistoryPageAdapter }` and export the port.
    The module is `global: true`, so no use-case module imports are needed.

New repository capability `ThreadRepositoryPort.threadHasRuns(orgId, threadId): boolean`:

- Adapter implementation: `EXISTS (SELECT 1 FROM runs WHERE thread_id = ?)` over the new
  `runs_thread_idx` (section 6.3). One indexed probe, not the org-wide
  `threadIdsWithRuns` `SELECT DISTINCT` (`thread-repository.adapter.ts:230-240`).
- Replaces `bindingLocked: threadIdsWithRuns(orgId).has(thread.id)` in every single-thread summary
  path. `ListThreadsUseCase` keeps the bulk `threadIdsWithRuns` for the list (one query for the
  whole list, now index-covered) — document that this is a deliberate bulk/single split.
  **[rev3]**

New injectable assembler `apps/server/src/app/application/threads/thread-summary.assembler.ts`. It
replaces the draft's free function `buildThreadSummary` and the 6-repository fan-out in every use
case. It is the single owner of a single-thread summary.

```ts
export interface ThreadSummaryAssemblyInput {
  orgId: string;
  thread: ThreadRecord;
  waitingForProfileId?: string;
  userId?: string;
}

@Injectable()
export class ThreadSummaryAssembler {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(input: ThreadSummaryAssemblyInput): Promise<ThreadSummary>;
}
```

It wraps `membersOf`, `participantsOf`, `runAttributionNamesOf`, and `toThreadSummary`
(`thread.helpers.ts:259-299`), fetches the active run itself (`executor.lifecycle(orgId).activeByThread`),
and computes `bindingLocked` via `threads.threadHasRuns(orgId, thread.id)`. It does **not** re-fetch
the thread (the caller passes it). `GetThreadUseCase`, `MarkThreadReadUseCase`, and
`DeleteThreadEventUseCase` are refactored to use it in the same commit so there is one summary
owner. Register it in `thread.use-case.module.ts`. The assembler performs the same repository
fan-out `GetThreadUseCase` does today, so there is no per-request regression; the small tables
(users, nodes, participants) are the bulk of it. **[rev3]**

New use case `apps/server/src/app/application/threads/sync-thread-events.use-case.ts`:

- `@Injectable() export class SyncThreadEventsUseCase`.
- Injects `ThreadRepositoryPort`, `ThreadHistoryPagePort`, `ThreadSummaryAssembler`.
- `execute({ orgId, threadId, afterThreadSeq, userId })`:
  1. `threads.findById` or throw `ThreadNotFoundException`.
  2. `slice = await history.syncSlice(orgId, threadId, afterThreadSeq, THREAD_SYNC_MAX_EVENTS + 1)`.
  3. `waitingForProfileId = await history.waitingForProfileId(orgId, threadId)`.
  4. `summary = await assembler.execute({ orgId, thread, waitingForProfileId, userId })`.
  5. If `slice.deletions.length > THREAD_SYNC_MAX_DELETIONS`, return
     `{ reset: true, summary, events: [], cursor: slice.serverMax, hasMore: false, deletions: [] }`.
  6. `hasMore = slice.rows.length > THREAD_SYNC_MAX_EVENTS`; cap rows to the first
     `THREAD_SYNC_MAX_EVENTS`.
  7. `events = projectThreadEvents(rows)`.
  8. `cursor = max(slice.serverMax, max threadSeq of rows)`.
  9. Return `{ reset: false, summary, events, cursor, hasMore, deletions: slice.deletions }`.

  The summary is built **after** the slice read, so `activeRun`, `unread`, and `lastError` are as
  fresh as the payload. Summary freshness no longer gates log correctness (there is no epoch to
  compare), so a separate summary connection is fine. **[rev3]**

Controller (`apps/server/src/app/api/rest/threads.controller.ts`):

- Add `@Get(':threadId/sync')` next to `@Get(':threadId')`.
- `@Query(ThreadSyncQuerySchema) query: ThreadSyncQuery`, `@SessionPrincipal() principal`.
- Pass `userId` for user principals exactly like the current `get` method (lines 109-120).
- Register the use case in `apps/server/src/app/application/threads/thread.use-case.module.ts:40-76`.

DI and boot gate: after the commit run the server and wait for a successful boot. A DI token erased
by `import type` only fails at boot.

### 5.4 Client

API (`apps/webui/src/shared/api/threads.ts`):

```ts
export function syncThreadEvents(id: string, afterThreadSeq: number): Promise<ThreadSyncResponse>
```

Implementation mirrors `getThread` (lines 95-100): `apiJson` on
`${threadsBase(orgId)}/${encodeURIComponent(id)}/sync?afterThreadSeq=${afterThreadSeq}`.
Export from `apps/webui/src/shared/api/index.ts`.

Store (`apps/webui/src/entities/session/model/session.store.ts`) — two-tier log model **[rev3]**:

- A thread's `events[threadId]` is either a **history window** (when `history[threadId]` exists) or
  a **live tail** (otherwise). The tail is capped and never participates in sync/paging/resync; it
  exists only so the sidebar and agent badges can derive "waiting"/"running" without a full load.
  All existing readers (`state.events[threadId]`) keep working unchanged.
- `appendEvent` / `applyIncomingEvents` route to the tail when `history[threadId]` is undefined and
  trim it to `LIVE_TAIL_MAX_EVENTS = 200` events, keeping the most recent terminal / `ask` /
  `wait.started` / `hitl.answer` / `wait.resumed` event even if older (up to `LIVE_TAIL_ANCHORS = 4`
  anchors). A terminal event is always the last event of its run and runs are sequential, and the
  anchor retention makes the tail's status derivation exact regardless of size. `isWaiting` /
  `hasRunningSession` (`apps/webui/src/features/desk/model/use-agent-live-status.ts:38-84`) stay as
  pure functions but now run over a bounded tail or a budgeted window; the `WeakMap` caches there
  become unnecessary and are removed.
- Replace `historyLoaded: Record<string, boolean>` (lines 44, 86, 106, 114, 294) with
  `history: Record<string, ThreadHistoryWindow>`:

```ts
export interface ThreadHistoryWindow {
  minThreadSeq: number;
  maxThreadSeq: number;
  windowVersion: number;   // bumped only on reset/replace, used as the request guard
  hasMoreBefore: boolean;
  hiddenRunsBefore: number | null;
  firstUserThreadSeq: number | null;
  fullOnly: boolean;
}
```

  `fullOnly` is `true` when the window was created from a snapshot that contains inherited fork
  events (Phase 1 only); such a window never uses sync, and its `minThreadSeq`/`maxThreadSeq` are
  left `0` and are never read. `fullOnly` is removed in Phase 2. `windowVersion` replaces the
  rev2 `logEpoch + touchedAt` guard: it increments only when the window is replaced or reset, so a
  concurrent page load and sync do not invalidate each other. **[rev3]**

- New `normalizeThreadEvents(events)` in `apps/webui/src/entities/session/model/normalize-events.ts`:
  `coalesceStreamDeltas` plus "keep only the last `model.stats` event". Called by every store action
  that installs a log (`replaceEvents`, `applyThreadSync`, `applyHistoryPage`). This is the client
  half of the projection-purity split (section 3). A unit spec covers it; the server projection spec
  case that asserted stats dropping is deleted (logic moved).

- `applyFullSnapshot(threadId, record: ThreadRecord)` — the cold path and the fork path:
  - `coalesced = normalizeThreadEvents(record.events)`.
  - `fullOnly = record.inheritedEventCount > 0`. **Do not slice the projected array by
    `inheritedEventCount`**: projection drops and coalesces events, so the raw count is not an index
    into it. A `fullOnly` window is not used for sync/cursors/viewed-seq at all, so it is created
    with `minThreadSeq: 0, maxThreadSeq: 0`. For a non-fork thread (`inheritedEventCount === 0`) the
    min/max come from `coalesced`; inherited events carry the parent's `thread_seq`
    (`fork-logs.ts:103-107`) and never appear in a windowed thread. This resolves the rev2
    contradiction where `reconcileEvents` wrote `maxThreadSeq` over the merged snapshot: `fullOnly`
    windows never set or read bounds, and `reconcileEvents` skips window maintenance for them.
    **[rev3]**
  - `window = { minThreadSeq, maxThreadSeq, windowVersion: 0, hasMoreBefore: false,
    hiddenRunsBefore: null, firstUserThreadSeq: null, fullOnly }`.
  - `clearLiveTail(threadId)`, `dropPendingThreads([threadId])`, then `applyBatches(takePending())`
    first, then set `events`, `seenAt`, `seqCeil`, `feedUpdate`, `contentEpoch`. **[rev3]**
  - `replaceEvents` (used by `openNewThread`, `openGroupThread`, `branchThread`) delegates to
    `applyFullSnapshot` with an empty/own-events record.

- New `applyDeletions(threadId, deletions): boolean` — pure store helper: for each `{from, to}`
  (to 0 = open), drop events with `threadSeq >= from && (to === 0 || threadSeq <= to)`, rebuild
  `feeds` via `feedUpdate`, and return whether anything was dropped. Dropping also prunes the
  removed events' `seenAt`/`sentSkills` keys. Used by `applyThreadSync`, the SSE invalidation
  handler, and the delete/undo mutation actions. **[rev3]**

- New `applyThreadSync(threadId, response): 'applied' | 'reload'`:
  - Capture `const windowBefore = history[threadId]` and `const cursorBefore = windowBefore.maxThreadSeq`
    **before** anything else. Do not read `maxThreadSeq` after `applyBatches`: live events advance
    it, and the request was built from the old value.
  - `applyDeletions(threadId, response.deletions)` (bumps `windowVersion` if anything dropped).
  - `base = applyBatches(state, takePending())`.
  - `merged = reconcileSnapshot(base.events[threadId] ?? EMPTY_EVENTS, response.events, { windowStart: cursorBefore + 1 })`,
    then `normalizeThreadEvents`.
  - Upsert the summary (`toStudioSummary`).
  - If `!windowBefore || response.reset`: `dropThreadLog(threadId)` and return `'reload'` (the caller
    runs the cold path once). This is the only reload, and only for the deletion-journal cap or a
    missing window. **[rev3]**
  - Otherwise update `events`, `seenAt` via `fillSeenAt`, `seqCeil` via `mergeSeqCeil`,
    `contentEpoch`, `feedUpdate(threadId, merged, seenAt, null)`, and
    `history[threadId].maxThreadSeq = Math.max(base.history[threadId].maxThreadSeq, response.cursor)`.
  - If `response.hasMore`, schedule the next `syncThreadEvents(threadId, response.cursor)` in the
    same call path (bounded by the finite distance to `serverMax`); the caller (`refreshThread`)
    runs the loop until `hasMore === false` or `'reload'`. **[rev3]**
  - `sameThreadLog(current, merged)` may short-circuit the feed rebuild, but the window and summary
    are updated even when the log is identical.
  - Refresh `touchedAt[threadId]` and call `trimHistoryCache()`.

- `reconcileEvents` (Phase 1 only, the full-snapshot path) also maintains the window: for a non-fork
  window set `maxThreadSeq` to the max over the snapshot, keep `minThreadSeq`, set `windowVersion` to
  its current value, and keep `fullOnly` (a fork snapshot never syncs). For a `fullOnly` window do
  not touch bounds. Phase 2 deletes the action. **[rev3]**

- Live cursor advance: in `applyBatches` (`session.store.ts` helper `applyBatches` in
  `session-batches.ts`), when `state.history[threadId]` exists, set
  `maxThreadSeq = Math.max(maxThreadSeq, max threadSeq over incoming events)`. This is what keeps a
  terminal sync small: without it the client re-downloads the entire run that SSE already delivered.

- `reconcileSnapshot` (`apps/webui/src/entities/session/model/reconcile-snapshot.ts:104-137`):
  - Optional third argument `{ windowStart?: number }`; local events with
    `threadSeq !== undefined && threadSeq < windowStart` are kept unconditionally.
  - Straddling stream slot: a local merged delta can begin before `windowStart` and end after it
    (the client cursor advances on live events). Before dropping a slot, compute `slotText` = the
    local slot text and `rowsText` = the concatenation of all snapshot rows with the same identity.
    If `slotText.endsWith(rowsText)`, take all those rows and keep the local slot (the local copy
    already contains the full text). Otherwise apply today's prefix rule (`slotText.startsWith(overlapText)`
    for rows with `seq >= slot.seq`). Keep the existing behavior when `windowStart` is absent. Add a
    dev assertion (test-only) that, per stream identity, a kept local slot's concatenated rows equal
    the concatenation of the snapshot rows with `seq <= slot.seq`; this guards the text rules against
    silent duplication on tool-delta retries. **[rev3]**
  - Update the comment at lines 101-103: the snapshot is a complete prefix, or a delta window when
    `windowStart` is set.

Call sites:

- `apps/webui/src/features/desk/model/refresh-thread.ts`:
  - Signature becomes `refreshThread(threadId, options?): Promise<boolean>`; side effects happen
    inside. No caller needs the record.
  - Keep the `inflight` dedupe and the `activeRuns` guard.
  - Read `history[threadId]` and the cached thread:
    - no window → cold path: Phase 1 `getThread` + `applyFullSnapshot`; Phase 2
      `getThreadHistory(threadId)` + `applyHistoryPage(threadId, page)`.
    - `window.fullOnly` (forks) → cold path (full snapshot) until Phase 2 removes inherited events.
    - otherwise → `syncThreadEvents(threadId, window.maxThreadSeq)` + `applyThreadSync`, looping on
      `hasMore`; on `'reload'` call the cold path once.
  - `syncRunStateFromThread(summary.id, summary.activeRun ?? null)` and the summary upsert happen
    for both paths.
- `ensureThreadCached` (`refresh-thread.ts:34-45`) uses `getThreadSummary` in Phase 2; in Phase 1 it
  keeps `getThread` + `applyFullSnapshot`.
- `apps/webui/src/features/desk/ui/desk-sync.tsx:105-121`: `resyncThreadEvents` now iterates
  **windows only** (threads with a `history` entry) and calls `refreshThread` (which syncs and, via
  the deletion journal, heals removals below the cursor). Threads with only a live tail are not
  refetched: their status refreshes from the next summary sync, and their window loads on open.
  Phase 2 switches the window resync to a range reconcile. **[rev3]**
- `apps/webui/src/features/send-message/model/thread-events.ts`:
  - `reconcileThread` uses `refreshThread(threadId)`.
  - `resyncThreadEvents` (lines 27-39) iterates `history` windows (not `session.events`), removing
    the reconnect storm over unopened threads. **[rev3]**
  - The org-wide SSE handler still feeds live events to every thread (for the tail), but that is now
    bounded by `LIVE_TAIL_MAX_EVENTS` per thread. **[rev3]**
- `apps/webui/src/widgets/chat-transcript/model/thread-sync.ts:5-38`: `loaded` becomes
  `history[threadId] !== undefined`.

### 5.5 Mutation responses (also Phase 1)

The delete and undo endpoints still return the complete thread today, which defeats the goal on rare
actions. Change their response shape in the same phase **behind an explicit opt-in**, so a tab
running an older bundle keeps receiving the legacy payload and never sees a shape it cannot parse.

Request: `DELETE /orgs/:orgId/threads/:threadId/events/:threadSeq?shape=v2` and
`POST /threads/:threadId/compact/undo?shape=v2`. The new client always sends `shape=v2`; without it
the server returns the legacy `ThreadPublic` (full log in Phase 1, tail page in Phase 2). Phase 3
removes the legacy branch.

Contracts in `packages/contracts/src/thread.ts`:

```ts
export const DeleteThreadEventResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('truncated'),
    fromThreadSeq: z.number().int().positive(),
    summary: ThreadSummarySchema,
    cursor: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('removed'),
    threadSeq: z.number().int().positive(),
    summary: ThreadSummarySchema,
    cursor: z.number().int().nonnegative(),
  }),
]);
export const UndoCompactResponseSchema = z.object({
  removedThreadSeq: z.number().int().positive(),
  summary: ThreadSummarySchema,
  cursor: z.number().int().nonnegative(),
});
```

`cursor` is mandatory: truncation and undo both remove the newest rows while
`threads.last_thread_seq` stays put. Without a fresh `cursor` the client keeps a stale
`maxThreadSeq` and would send an `afterThreadSeq` past the server's new max on the next sync; the
client sets `window.maxThreadSeq = response.cursor`. The deletion range returned by the mutation's
`thread.log-changed` frame (and the journal on the next sync) is what actually drops the removed
events from other tabs.

Server:

- `DeleteThreadEventUseCase` (`apps/server/src/app/application/threads/delete-thread-event.use-case.ts:44-92`):
  - Replace the whole-log target lookup (`events.listByThread(threadId).find(...)` at lines 49-52)
    with `events.eventAt(threadId, threadSeq)` (`sqlite-run-events.adapter.ts:194-201`). **[rev3]**
  - After `truncateThreadFrom` return `{ kind: 'truncated', fromThreadSeq, cursor }`; after
    `removeThreadEvent` return `{ kind: 'removed', threadSeq, cursor }`. Build the summary with
    `ThreadSummaryAssembler`; no tail re-read, no full log, no `collectInheritedEvents`.
    `cursor = history.syncSlice(..., 1).serverMax` after the mutation (or a dedicated
    `maxThreadSeq` probe).
  - Publish `thread-log-changed` on the org `EventBusPort` with the deletion range (section 5.6).
    **[rev3]**
- `UndoThreadCompactUseCase` (`apps/server/src/app/application/threads/undo-thread-compact.use-case.ts:14`):
  return `{ removedThreadSeq, summary, cursor }`. It grows `ThreadRepositoryPort`,
  `ThreadHistoryPagePort` (cursor), and `ThreadSummaryAssembler` on top of `LocalExecutorPort`. Its
  controller is `apps/server/src/app/api/rest/thread-compact.controller.ts` (route base `/threads`,
  not `/orgs/:orgId/threads`) — update it there. Publish `thread-log-changed` as well. **[rev3]**
- Controller signatures change accordingly (`threads.controller.ts:225-239` for delete).

Client:

- `deleteUserMessage` / `deleteErrorEvent` (`apps/webui/src/features/send-message/model/delete-turn.ts:5-22`):
  - Send `?shape=v2` and accept both shapes anyway: if the response has `events` (legacy server or a
    rolled-back server), fall back to `applyFullSnapshot`. Delete the fallback in Phase 3.
  - Upsert `summary` via `toStudioSummary`; set `window.maxThreadSeq = cursor`.
  - `truncated`: drop local events with `threadSeq >= fromThreadSeq` via `applyDeletions`.
  - `removed`: drop exactly that seq via `applyDeletions`.
  - Rebuild the feed via `feedUpdate(threadId, events, seenAt, null)` and bump `contentEpoch`.
    Do not call `replaceEvents`.
- `undoCompact` (`apps/webui/src/features/compact-thread/model/undo-compact.ts:13-31`): send
  `?shape=v2`; remove `removedThreadSeq` via `applyDeletions` (fall back to the legacy full snapshot
  when the response has `events`), upsert the summary, update the window (`maxThreadSeq = cursor`),
  rebuild the feed. Do not call `getThread`.
- `compactThread` (`apps/webui/src/features/compact-thread/model/compact-thread.ts:24-62`):
  replace the `getThread` refresh with `refreshThread(threadId, { force: true })`; compaction
  appends an anchor event, so the sync picks it up. If the run is still active, force.
- `session.store` needs `removeEventAt(threadId, threadSeq)` and `truncateFrom(threadId, threadSeq)`
  actions that reuse `applyDeletions` and `feedUpdate`, plus the window updates above. Each of these
  actions also runs the full cleanup of `dropThreadLog` (section 5.7) scoped to the removed events.
  **[rev3]**

### 5.6 SSE invalidation frame **[rev3]**

A delete in tab A must be visible in idle tab B without waiting for the next terminal event.

- Server: `DeleteThreadEventUseCase` and `UndoThreadCompactUseCase` publish on the org `EventBusPort`
  (`apps/server/src/app/domain/events/event-bus.port.ts`) a `thread.log-changed` event
  `{ threadId, deletions: ThreadLogDeletion[], serverMax: number }`.
- Bridge: `apps/server/src/app/infra/events-watch/events-watch-bridge.ts` subscribes to
  `thread.log-changed` and `hub.publish(orgId, 'thread-log-changed', frame)` (same pattern as
  `publishDesk` at lines 129-132).
- Client: new `watchThreadLogChanged(orgId, cb)` in `apps/webui/src/shared/api/events.ts` (mirrors
  `watchThreadEvents`, channel `thread-log-changed`). `DeskSync` wires it: on a frame, apply
  `applyDeletions(threadId, deletions)` to the window and the live tail, set
  `window.maxThreadSeq = serverMax`, and `void refreshThread(threadId)` if the thread has a window.
  Frames are org-scoped and small; a frame for a thread with no local window/tail is ignored.

This is push, not polling, and it makes multi-tab healing immediate. The deletion journal is the
transport: the frame carries the same ranges the sync would return.

### 5.7 Window reset cleanup **[rev3]**

`dropThreadLog(threadId)` (used by `dropThreadHistory` in Phase 2 and the reset/reload paths) clears
the window and everything derived from it in one place, so no stale state can repopulate a reset
window:

- `events[threadId]`, `history[threadId]`, `feeds[threadId]`, `seqCeil[threadId]`.
- `dropPendingThreads([threadId])` (unflushed optimistic deltas of a cancelled run must not
  re-append), `clearLiveTail(threadId)`.
- `sentSkills` entries keyed by that thread's event keys.
- Keep `activeRuns`, `failures`, `seenAt` (rebuilt on next install), the thread summary, and
  `touchedAt` (cleared separately on thread deletion). Delete the entry in `removeForThreads`.

The delete/undo mutation actions run the same cleanup scoped to the removed events (they do not drop
the whole window).

### 5.8 Phase 1 acceptance

Automated:

- `bun run typecheck` in `apps/webui` and `apps/server`.
- `bunx biome check` on touched files.
- Server boots (DI resolution), including the `thread_log_deletions` table created on an existing
  org DB.
- Existing specs in `apps/webui/src/entities/session/model` stay green.
- New spec for `normalizeThreadEvents`; new spec for `applyDeletions` (open-ended and closed ranges,
  including a range entirely below the window min); new spec for `applyThreadSync` cursor rules is
  written only after the hand test (repo rule).

Manual (hand test before writing new specs):

- Open a large thread: network shows one `GET /threads/:id` (Phase 1) and no sync loop.
- Send a message on a large thread: the run streams; on `run.completed` exactly one
  `GET /threads/:id/sync?afterThreadSeq=N` whose `afterThreadSeq` is the **last live event's**
  thread seq, and the payload is kilobytes, not the whole run. No feed flicker, no scroll jump.
- Open a 500+-run thread, send a message: the sync payload stays small even though the run is long,
  and if SSE was disconnected mid-run the sync loops a bounded number of times instead of a full
  reload. **[rev3]**
- Reconnect SSE (toggle Wi-Fi or sleep/wake): resync happens, loaded messages do not disappear, and
  the reconnect does not fetch every thread that ever emitted an event. **[rev3]**
- Open a forked thread: inherited history renders, a run completion still uses the full refresh, no
  reload loop, and the unread separator is not driven by inherited parent seqs. **[rev3]**
- Delete an old-ish message: response is small; the list updates without a full reload.
- Delete a message in window A and look at idle window B: window B heals via the
  `thread-log-changed` frame without reopening, and older loaded pages are preserved (no window
  reload). **[rev3]**
- Undo compact on a large thread: no full-history payload, no sync loop afterwards.
- Compact on a large thread: no full-history payload.
- A thread with a live tail only (never opened) stays bounded: after a long stream its
  `events[threadId]` does not grow past `LIVE_TAIL_MAX_EVENTS`, and the agent badge still shows
  waiting/running correctly. **[rev3]**

Expected result: terminal/SSE paths drop from megabytes to kilobytes; cold open is unchanged until
Phase 2.

### 5.9 Rollout and rollback

One commit containing the server and the client side. The server adds `GET /sync` and the
`thread_log_deletions` table (additive, `CREATE TABLE IF NOT EXISTS`, no `ALTER TABLE` migration).
Mutation responses are opt-in (`?shape=v2`), so any bundle that does not ask for the new shape keeps
receiving `ThreadPublic`.

Rollback: revert the phase commit, or roll back only the server. The old client tolerates the legacy
shape; the new client's dual-shape fallback covers the reverse. The `thread_log_deletions` table is
harmless if left behind (rows are only ever read by the new sync route).

A browser tab loaded from an older bundle keeps working: `GET /threads/:id` is still present in
Phase 1, and mutation responses default to the legacy shape.

## 6. Phase 2: windowed history and fork UX

Goal: bound the cold open and memory. Ship the server page first, then switch the client, then keep
the legacy route as a compatibility shell for one release (section 6.9). Phase 2 is a sequence of
revertable commits within one release, each carrying its own server+client slice: (1) page endpoints
+ tail-only client, (2) load-earlier + prefetch, (3) marker/unread migration, (4) fork-UX change +
spawn/inspector endpoints. **[rev3]**

### 6.1 Product/UX spec

- Default page: last 20 **root runs** (`THREAD_HISTORY_PAGE_RUNS = 20`; a root run is a `runs` row
  with `parent_run_id IS NULL`, or an orphan whose parent row no longer exists — section 6.3), each
  page with its full descendant subtree, hard byte cap `THREAD_HISTORY_PAGE_MAX_BYTES = 1_500_000`
  after projection. One root run (with its subtree) may exceed the cap; it is returned as-is.
- Render window stays 12 runs (`TAIL_RUNS`, `apps/webui/src/widgets/chat-transcript/ui/thread-panel.tsx:60`).
  "Load earlier" first expands the render window from already loaded runs (instant), and only when
  the render window reaches the loaded boundary does it fetch a page. When the user returns to the
  tail (viewing at the end), `renderSize` resets to `TAIL_RUNS`, so the DOM never grows past a
  bounded window. **[rev3]**
- Prefetch: when the loaded boundary is reached and the viewport is within 600 px of the top and
  `hasMoreBefore`, fetch the next page once in the background. No polling.
- "Load earlier" label: use `hiddenRunsBefore` from the page (exact number of root runs below the
  loaded window) plus the loaded-but-not-rendered runs. If the server returns `null`, show no
  number. Never show `0` while the button is visible.
- Scroll: prepending must preserve the anchor. The primitive supports `preserveScrollOnPrepend`
  (`apps/webui/src/shared/ui/message-scroller.tsx`). Pre-flight is resolved: the installed
  `@shadcn/react@0.3.1` exposes `preserveScrollOnPrepend` and `onScroll` on the viewport
  (`dist/message-scroller/index.d.ts`), and `useMessageScroller().scrollToMessage(id)` with
  `Item.messageId` (used for the Phase 3 deep link). If the installed version ever lacks it,
  implement the anchor manually with `useLayoutEffect` (`use-prepend-restore.ts:9-34`). **[rev3]**
- Loading error: inline retry on the button, keep the position, no toast storm, no automatic retry.
- Fork: a child thread shows only its own events. The `ForkSeparator`
  (`apps/webui/src/widgets/chat-transcript/ui/fork-separator.tsx:4-36`) is rendered once, at the top
  of the child log, whenever `thread.parentThreadId` is set. Parent history is no longer duplicated
  inline. This is an explicit product decision (2026-11-23).
- Issue/schedule journal (`apps/webui/src/widgets/thread-journal/ui/thread-journal.tsx:60-163`)
  gets the same window/page behavior; it no longer renders all runs at once.
- Spawn tabs read the spawn's own transcript from the server, not from the thread window
  (section 6.6).
- The inspector's thread files are not limited to the loaded window (section 6.6).
- Memory: cap loaded history across threads (`HISTORY_EVENTS_BUDGET = 50_000` events, in
  `apps/webui/src/shared/config/constants.ts`), plus live tails capped at `LIVE_TAIL_MAX_EVENTS`
  per thread. Eviction protects the mounted chat threads (max 8), the focused thread, and every
  thread with an active run; only other windows and tails are evicted, least recently touched first,
  at most one per trim. If all candidates are protected, keep the window (soft cap) and record a
  trace event. **[rev3]**
- A windowed thread's `events` is its loaded window (bounded by the budget); a thread with no
  window keeps only its capped tail. This is the two-tier model from section 5.4.

### 6.2 Contract

Add to `packages/contracts/src/thread.ts`:

```ts
export const THREAD_HISTORY_PAGE_RUNS = 20;
export const THREAD_HISTORY_PAGE_MAX_BYTES = 1_500_000;
export const THREAD_HISTORY_RANGE_MAX_EVENTS = 8_000;

export const ThreadHistoryQuerySchema = z
  .object({
    beforeThreadSeq: z.coerce.number().int().positive().optional(),
    fromThreadSeq: z.coerce.number().int().positive().optional(),
    toThreadSeq: z.coerce.number().int().positive().optional(),
    limitRuns: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (q) => (q.fromThreadSeq === undefined) === (q.toThreadSeq === undefined),
    { message: 'fromThreadSeq and toThreadSeq must be provided together' },
  )
  .refine(
    (q) => q.beforeThreadSeq === undefined || q.fromThreadSeq === undefined,
    { message: 'beforeThreadSeq is mutually exclusive with fromThreadSeq/toThreadSeq' },
  );

export const ThreadHistoryPageSchema = z.object({
  kind: z.enum(['tail', 'before', 'range']),
  summary: ThreadSummarySchema,
  events: z.array(z.unknown()),
  minThreadSeq: z.number().int().nonnegative(),
  maxThreadSeq: z.number().int().nonnegative(),
  hasMoreBefore: z.boolean(),
  hasMoreAfter: z.boolean(),
  hiddenRunsBefore: z.number().int().nonnegative().nullable(),
  firstUserThreadSeq: z.number().int().positive().nullable(),
});
export type ThreadHistoryPage = z.infer<typeof ThreadHistoryPageSchema>;
```

- `kind` tells the client how to apply the response; a range request that is too large comes back as
  a **chunk** (`kind: 'range'` with `hasMoreAfter: true`) rather than a tail reset, so a reconnect
  never collapses the loaded window. The client loops on `hasMoreAfter` until the range is healed.
  A range that straddles a run (the `complete: false` case) returns `kind: 'tail'`; the client
  applies it as a tail reset — this is the only path that resets the window, and it only happens
  when the loaded bounds are invalid by construction. **[rev3]**
- `hiddenRunsBefore` replaces `totalRuns`: it is counted in the same unit as the page (root runs)
  and is exact for the loaded window. `hasMoreBefore` is `hiddenRunsBefore > 0` when the count is
  known. `hasMoreAfter` is `false` for `tail`/`before` and meaningful only for `range`.
- `firstUserThreadSeq` exists for the issue rerun fallback (section 6.8).

Endpoints:

- `GET /orgs/:orgId/threads/:threadId/history`:
  - no query: tail page.
  - `beforeThreadSeq`: page-up.
  - `fromThreadSeq` + `toThreadSeq`: range reconcile, chunked when it exceeds the cap.
- `GET /orgs/:orgId/threads/:threadId/summary` returning `ThreadSummarySchema` (IDE tab fallback and
  pin toggle).
- `GET /orgs/:orgId/threads/:threadId/runs/:runId/subtree` returning `{ events: z.array(z.unknown()) }`
  for the spawn tab (section 6.6). The server verifies the run belongs to the thread; a foreign
  `runId` is 404. **[rev3]**
- `GET /orgs/:orgId/threads/:threadId/artifacts` returning `{ items: RunArtifactSchema[] }` for the
  inspector (section 6.6).

### 6.3 Server page selection

Extend `ThreadHistoryPagePort`:

```ts
export interface ThreadHistoryPageRequest {
  beforeThreadSeq?: number;
  limitRuns?: number;
}

export interface ThreadHistorySlice {
  events: SessionEvent[];
  minThreadSeq: number;
  maxThreadSeq: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  hiddenRunsBefore: number | null;
  firstUserThreadSeq: number | null;
  waitingForProfileId?: string;
  complete: boolean;
}

abstract listPage(orgId: string, threadId: string, request: ThreadHistoryPageRequest): Promise<ThreadHistorySlice>;
abstract listRange(orgId: string, threadId: string, fromThreadSeq: number, toThreadSeq: number): Promise<ThreadHistorySlice>;
abstract listRunSubtree(orgId: string, threadId: string, runId: string): Promise<SessionEvent[]>;
abstract listToolEvents(orgId: string, threadId: string): Promise<SessionEvent[]>;
```

`ThreadHistorySlice` is a domain type; the contracts DTO `ThreadHistoryPage` is assembled in the use
case. Do not reuse one name across the layers.

`listRange` returns rows in `[fromThreadSeq, toThreadSeq)`, no run snapping, `hiddenRunsBefore:
null`, `hasMoreBefore: false`. The client only passes server-returned `minThreadSeq` / `maxThreadSeq`
values, which are safe boundaries by construction. `listRange` verifies with a single `EXISTS` probe
that no run has events on both sides of either edge; `complete: false` means a run straddles and the
use case must return the tail page with `kind: 'tail'` instead of a partial range. If `COUNT(*)` in
the range exceeds `THREAD_HISTORY_RANGE_MAX_EVENTS` (a `LIMIT cap + 1` probe, not fetch-then-discard),
the use case returns `kind: 'range'` with the first `THREAD_HISTORY_RANGE_MAX_EVENTS` rows and
`hasMoreAfter: true`; the client re-requests with the advanced `fromThreadSeq`. This replaces the
rev2 `kind: 'tail'` fallback for oversized ranges. **[rev3]**

Algorithm for `listPage` (all inside one org DB session):

1. `limit = request.limitRuns ?? THREAD_HISTORY_PAGE_RUNS`.
2. Select root runs, newest first, by first event. A root is a run with no parent, or an orphan whose
   parent row was removed by `deleteEmptiedRuns` (`sqlite-thread-truncate.ts:103-118`) — the orphan
   guard prevents such runs from silently disappearing from every page. **[rev3]**

```sql
SELECT r.run_id,
       (SELECT MIN(e.thread_seq) FROM run_events e WHERE e.run_id = r.run_id) AS start_seq
FROM runs r
WHERE r.thread_id = ?
  AND (r.parent_run_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM runs p WHERE p.run_id = r.parent_run_id))
  AND EXISTS (
    SELECT 1 FROM run_events e2
    WHERE e2.run_id = r.run_id
      AND (? IS NULL OR e2.thread_seq < ?)
  )
ORDER BY start_seq DESC
LIMIT ?  -- limit + 1
```

Root runs are sequential per thread: `runs_active_root_idx` is unique for active root runs and a
parent run is awaited by its spawns before it terminates (`graph.ts:2035`), so root-run starts are
safe page boundaries. Descendants never start before their root. The picker spec must pin this with
a fixture containing a spawned child (test 2 in 6.10).

3. `hasMoreBefore = rows.length > limit`; `pageRoots = rows.slice(0, limit)`.
4. Resolve the run id set `pageRoots + all descendants` with a recursive CTE over
   `runs.parent_run_id`:

```sql
WITH RECURSIVE sub(run_id) AS (
  SELECT run_id FROM runs WHERE run_id IN (<pageRoots>)
  UNION ALL
  SELECT r.run_id FROM runs r JOIN sub ON r.parent_run_id = sub.run_id
)
SELECT run_id FROM sub
```

5. `pageStart = MIN(start_seq of pageRoots)`. Collect the triggering user event: starting at
   `pageStart - 1`, walk down while the row has `run_id IS NULL`, adding its `thread_seq` to
   `userSeqs`, and **stop after the first `type = 'user'` row**; hard cap the walk at
   `PAGE_BOUNDARY_MAX = 20` rows. User events are inserted with `run_id = NULL`
   (`apps/server/src/app/infra/org-sqlite/thread-transcript.store.ts:81-93`), so a page never starts
   with an assistant turn without its user message, and the walk cannot overrun into an older turn.
   **[rev3]**
6. Fetch events: `thread_id = ? AND (run_id IN (<subtree ids>) OR thread_seq IN (<userSeqs>))`
   ordered by `thread_seq`. Whole runs plus the explicit boundary user event. Note the
   `thread_seq IN (...)` form: a `thread_seq >= pageStart` predicate would pull the whole tail into a
   page-up request. `run_events_run_seq_idx` serves the run id lookup; the page is sorted in memory
   (page-sized).
7. `minThreadSeq` = the smallest returned `thread_seq` (a `userSeqs` entry, when present);
   `maxThreadSeq` = the largest (0 when empty). An empty `before` page (`beforeThreadSeq` below the
   first root) returns `hasMoreBefore: false` and must not overwrite the client's window bounds.
8. `hiddenRunsBefore` = count of root runs whose first event is `< minThreadSeq`, using the same
   orphan-aware root predicate as step 2:

```sql
SELECT COUNT(*) FROM runs r
WHERE r.thread_id = ? AND (r.parent_run_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM runs p WHERE p.run_id = r.parent_run_id))
  AND EXISTS (SELECT 1 FROM run_events e WHERE e.run_id = r.run_id AND e.thread_seq < ?)
```

9. `firstUserThreadSeq = SELECT MIN(thread_seq) FROM run_events WHERE thread_id = ? AND type = 'user'`.
10. `waitingForProfileId` from the port.

Byte cap lives in the use case: project the page (slice-pure), compute
`Buffer.byteLength(JSON.stringify(events))`; if it exceeds `THREAD_HISTORY_PAGE_MAX_BYTES` and
`limitRuns > 1`, retry once with `Math.max(1, Math.floor(limit / 2))` and **recompute**
`minThreadSeq`, `hasMoreBefore`, `hiddenRunsBefore` from the retried page; otherwise accept. The cap
is measured in UTF-8 bytes, not string length. **[rev3]**

Ordering note: order runs by `MIN(thread_seq)`, not `runs.created_at`. Thread seq is monotonic per
thread and immune to clock skew across hosts.

Indexes: add `CREATE INDEX IF NOT EXISTS runs_thread_idx ON runs(thread_id)` to `CREATE_RUNS_SQL`
(`org-sql.ts:597-626`). It is applied on boot to existing DBs because the statement is executed
every time (`org-sql-ensure.ts:241`). `threadHasRuns`, `threadIdsWithRuns`, and every page count
need it. `runs(parent_run_id)` is not required for page-sized recursions.

New use case `apps/server/src/app/application/threads/get-thread-history.use-case.ts`:

- Injects `ThreadRepositoryPort`, `ThreadHistoryPagePort`, `ThreadSummaryAssembler`.
- Resolves `thread`, calls `listPage`/`listRange`, projects once (slice-pure), assembles the summary,
  and returns the DTO with `kind` set to what the server actually returned.
- On a range request above the cap, returns `kind: 'range'` with `hasMoreAfter: true`; on a straddled
  range returns `kind: 'tail'`.

New use case `apps/server/src/app/application/threads/get-thread-summary.use-case.ts`:
`execute({ orgId, threadId, userId })` returns `ThreadSummary` using `ThreadSummaryAssembler` and
`ThreadHistoryPagePort.waitingForProfileId`.

New use case `apps/server/src/app/application/threads/get-run-subtree.use-case.ts` and
`list-run-artifacts.use-case.ts` for section 6.6.

Controller: add `@Get(':threadId/history')`, `@Get(':threadId/summary')`,
`@Get(':threadId/runs/:runId/subtree')`, `@Get(':threadId/artifacts')`; register the use cases in
`thread.use-case.module.ts`.

### 6.4 Client window

API (`apps/webui/src/shared/api/threads.ts`):

```ts
getThreadHistory(id, options?: { beforeThreadSeq?; fromThreadSeq?; toThreadSeq?; limitRuns? }): Promise<ThreadHistoryPage>
getThreadSummary(id): Promise<ThreadSummary>
getRunSubtree(id, runId): Promise<{ events: SessionEvent[] }>
getThreadArtifacts(id): Promise<{ items: ThreadArtifact[] }>
```

`getThreadHistory`/`getThreadSummary` fall back to the legacy `getThread` when the server returns
404 (rolled-back server or an older bundle pointing at a newer client); the fallback applies the
record via `applyFullSnapshot`. Removed in Phase 3 with the legacy route. **[rev3]**

Store:

- `history: Record<string, ThreadHistoryWindow>` from 5.4 (`fullOnly` is removed in Phase 2; every
  window is page-based). `windowVersion` is the request guard: each request captures it, and applies
  only if `history[threadId].windowVersion` is unchanged. It bumps on tail reset, truncation drop,
  and fork full reload — not on ordinary page/sync applies, so a concurrent page and sync do not
  invalidate each other. **[rev3]**
- `applyHistoryPage(threadId, page)` — the apply mode is `page.kind` (the server is authoritative; a
  range request that was too large arrives as `kind: 'range'` with `hasMoreAfter`). **[rev3]**
  - Always upsert `toStudioSummary(page.summary)`.
  - Refresh `touchedAt`, then `trimHistoryCache()`.
  - `tail`:
    - `base = applyBatches(state, takePending())`; `local = base.events[threadId] ?? EMPTY_EVENTS`.
    - Keep local events with `threadSeq === undefined` or `threadSeq >= page.minThreadSeq`; drop the
      rest (a tail load defines a new window).
    - `events = normalizeThreadEvents(reconcileSnapshot(kept, page.events, { windowStart: page.minThreadSeq }))`
      — merge, do not blind-replace, so live events that arrived after the request survive.
    - Set the window from the page (`min`, `max`, `hasMoreBefore`, `hiddenRunsBefore`,
      `firstUserThreadSeq`); bump `windowVersion`.
    - `seqCeil = ceilFromEvents(events)`, `fillSeenAt` for new keys, `feedUpdate(..., null)`, bump
      `contentEpoch`.
  - `before`:
    - `base = applyBatches(state, takePending())`; `current = base.events[threadId] ?? EMPTY_EVENTS`.
    - If `page.events.length === 0`, only set `hasMoreBefore = false` and return (keep the window
      bounds).
    - `events = normalizeThreadEvents(dedupeBySeq([...page.events, ...current]))` (dedupe by
      `threadSeq`, then coalesce) — defensive against an overlapping boundary.
    - `window.minThreadSeq = page.minThreadSeq`, `hasMoreBefore`, `hiddenRunsBefore`; keep
      `maxThreadSeq`, `windowVersion`, `firstUserThreadSeq`.
    - `fillSeenAt`, `feedUpdate(..., null)`, bump `contentEpoch`. Do not touch `seqCeil`.
  - `range`:
    - `base = applyBatches(state, takePending())`; `current = base.events[threadId] ?? EMPTY_EVENTS`.
    - Keep local events `< fromThreadSeq` or `> toThreadSeq`, insert `page.events`, sort by
      `threadSeq`, `normalizeThreadEvents`.
    - Recompute `minThreadSeq`/`maxThreadSeq` from the result; keep `windowVersion`,
      `firstUserThreadSeq`, `hasMoreBefore`, `hiddenRunsBefore`.
    - `fillSeenAt`, `feedUpdate(..., null)`, `mergeSeqCeil` (never reset — older runs keep their
      ceilings), bump `contentEpoch`.
    - If `page.hasMoreAfter`, re-request with `fromThreadSeq = page.maxThreadSeq` (chunked resync).
      **[rev3]**
- `loadEarlier(threadId)` in `apps/webui/src/features/desk/model/load-earlier.ts`:
  - Guard: no window, `!hasMoreBefore`, or an inflight request for the thread.
  - `getThreadHistory(threadId, { beforeThreadSeq: window.minThreadSeq })`, apply as `before`.
  - Export from `apps/webui/src/features/desk/index.ts`.
  - Propagate errors; the UI shows the retry state.
- `resyncThreadRange(threadId)` for SSE resync:
  `getThreadHistory(threadId, { fromThreadSeq: window.minThreadSeq, toThreadSeq: window.maxThreadSeq })`.
  If `page.kind === 'tail'` (straddled range), apply as `tail`; otherwise apply as `range` and loop
  on `hasMoreAfter`. **[rev3]**
- `dropThreadHistory(threadId)`: delegate to `dropThreadLog` (section 5.7) plus clearing `touchedAt`
  only on thread deletion.
- `trimHistoryCache()`: iterate `touchedAt` ascending; skip the focused thread, every id in
  `mountedThreads`, and every thread with `activeRuns[id]` or `thread.activeRunId != null`; evict at
  most one per call; soft-stop when all remaining threads are protected. Eviction drops both windows
  (via `dropThreadLog`) and live tails. `mountedThreads` is set by `ChatTranscript` from
  `mountedIds` (`chat-transcript.tsx:26-91`). **[rev3]**
- Generation guard: before applying a page/sync result, require that `history[threadId]` is still
  the window the request started from (same `windowVersion`). A result for an evicted or reset
  window is ignored; the thread refetches on the next mount.

`reconcileEvents` loses its last caller in Phase 2 once `refreshThread` and `resyncThreadEvents`
move to pages; delete it with its export. `replaceEvents` stays: it is the empty-log installer for
`openNewThread`, `openGroupThread`, and `branchThread` (delegating to `applyFullSnapshot`), and it is
the only path that installs a window for a freshly created thread. Delete `copyEvents` (no callers
at v0.10.25) in the same commit. **[rev3]**

Call sites:

- `features/desk/model/refresh-thread.ts`: cold path becomes `getThreadHistory` +
  `applyHistoryPage(threadId, page)`; warm path stays `syncThreadEvents`.
- `widgets/chat-transcript/model/thread-sync.ts`: `loaded` stays `history[threadId] !== undefined`.
- `features/send-message/model/thread-events.ts`: `resyncThreadEvents` iterates windowed threads and
  calls `resyncThreadRange`; threads without a window fall back to the tail page.
- `features/desk/ui/desk-sync.tsx`: unchanged wiring, now backed by `resyncThreadRange`.
- `widgets/ide-content/ui/ide-content.tsx:83-107`: `getThread` → `getThreadSummary`.
- `widgets/project-sidebar/model/thread-actions.ts:33-40`: `togglePin` updates the thread store
  directly and deletes `setThreadPinned` from `shared/api/threads.ts:298-300`; it never persisted the
  pin anyway.
- `features/desk/model/apply-desk-event.ts:30-37`: the `thread` desk event becomes **summary-only**.
  `applyDeskEvent` upserts `toClientThread(event.thread)` and, when a window is already loaded for
  that thread, calls `refreshThread(threadId)`; it never installs `event.thread.events`. This is the
  last full-history push path, and it must change before `reconcileEvents` is deleted (it is the one
  caller the `reconcileEvents` deletion would otherwise break). The server side currently never
  emits a `thread` DeskEvent (`type: 'thread'` has no emitter at v0.10.25); if one is ever wired, it
  must carry a summary, not `events`. **[rev3]**

### 6.5 Markers migrate to thread seq

These are the silent regressions if skipped.

1. Run identity and keys
   - `RunDraft` (`apps/webui/src/entities/session/model/feed/feed-run-drafts.ts:60-72`) and `FeedRun`
     (`feed-types.ts:218-228`) gain `firstThreadSeq: number | null` and `lastThreadSeq: number | null`.
     Remove `firstIndex` from `FeedRun` in the same change: its only consumers are
     `compaction-coverage.ts:55`, `thread-panel.tsx:161`, and `publishRun`, and all three move.
     Keep `firstIndex` on the draft as the key fallback.
   - `createRun` (`feed-run-fold.ts:260-274`) fills `firstThreadSeq`/`lastThreadSeq` from the event's
     `threadSeq` (null until assigned; the fold rebuild after `setEventThreadSeq` re-derives them).
     The published run keeps the values from the draft at publish time.
   - `publishRun` key fallback becomes `` `run-t${run.firstThreadSeq ?? run.firstIndex}` ``
     (`feed-run-publish.ts:67-103`). The optimistic user turn still keys on `clientEventId`, so the
     key never flips for the common case.
   - Update `apps/webui/src/entities/session/model/feed/compaction-coverage.spec.ts:39-46` fixture
     as a mechanical type change (`firstIndex`/event count → `firstThreadSeq`/`lastThreadSeq`); keep
     the existing assertions.
2. Compaction coverage
   - `apps/webui/src/entities/session/model/feed/compaction-coverage.ts:18-77`: use
     `event.coveredUntilThreadSeq`.
     - `number`: `isRunCovered(run)` = `run.lastThreadSeq !== null && run.lastThreadSeq <= value`;
       `firstLiveRunIndex` = the first run with `firstThreadSeq === null || firstThreadSeq > value`.
     - `null`: **unresolved boundary**. `replay-thread-history.ts:322-324` explicitly keeps the
       window whole for this value ("an unresolved cursor keeps the window whole"), so treat it as
       no coverage: do not dim runs and do not place a coverage divider. The compaction card itself
       still renders from the anchor event.
     - `undefined` (legacy anchors, including `durable: false` from
       `prepare-compaction-cursors.ts:44-46`): keep the current index-based fallback inside the
       loaded window; document it in the function.
   - `thread-panel.tsx:138,232,240` use the new boundary; no index math.
3. Unread
   - `apps/webui/src/widgets/chat-transcript/model/unseen-boundary.ts:5-46`: store `viewedSeq` in the
     session store, persisted to `localStorage` under `harnesys.viewed-seq.`. Delete the legacy
     `harnesys.viewed.` key when read. Legacy users see no separator once (accepted); do not migrate
     a count into a seq. Single owner: `markViewed` writes both the store and storage; hydration
     reads storage once per thread.
   - `session.store` gets `viewedSeq: Record<string, number>`, `hydrateViewedSeq(threadId)`, and
     `markViewed(threadId, seq)`. `markViewed` **overwrites** (sets, does not `max`) the stored seq:
     after a truncation the window max decreases, and a monotonic viewed seq would permanently hide
     the separator. **[rev3]**
   - `ThreadReadSync` (`thread-panel.tsx:340-357`, `thread-journal.tsx:188-204`) calls
     `markViewed(threadId, window.maxThreadSeq)` instead of `saveViewedCount(events.length)`.
   - `useUnseenBoundary` returns the first loaded run with `firstThreadSeq > viewedSeq`; if
     `viewedSeq < window.minThreadSeq`, the boundary is the first rendered run.
   - `useUnseenCount` (`use-unseen-count.ts`) keeps its own in-memory baseline: the max thread seq
     observed while the viewport is at the end. It counts loaded events with `threadSeq > baseline`;
     prepended pages never count. Do not drive the badge from `viewedSeq`: on a first open of an
     unread thread `viewedSeq` is absent, and a 0 would make the badge count the whole loaded window
     before `ThreadReadSync` runs.
4. Feed region split and fork
   - Remove the inherited region from `ThreadFeeds` (`feed-types.ts:236-239`), `feed-engine.ts`
     (lines 14-138), `feed-hooks.ts` (`useInheritedFeed`, `useThreadFeeds`), and every consumer:
     - `widgets/chat-transcript/ui/thread-panel.tsx:76-78,121,133,196-225`
     - `widgets/chat-transcript/ui/spawn-view.tsx:46-47` (rewritten, section 6.6)
     - `widgets/chat-transcript/ui/tool-group.tsx:90` (via `useFeedSpawns`)
     - `widgets/chat-transcript/ui/tool-line.tsx:185` (via `useFeedMap`)
     - `widgets/chat-transcript/ui/run-attachments.tsx:29-44`
     - `widgets/agent-inspector/ui/files-pane.tsx:79-84` (rewritten, section 6.6)
     - `entities/session/index.ts:14-19`
   - Target shape: `ThreadFeed { runs, spawns, maps }`; `useThreadFeed(threadId)` returns it.
     Delete `useThreadFeeds` and `useInheritedFeed`.
   - `feedUpdate` loses the boundary argument; `feedSetBoundary`, `feedBoundary`, and
     `setThreadFeedBoundary` (`session.store.ts:66,340-344`, `thread-panel-aux.ts:18-29`) are deleted.
   - `ThreadPanel` renders all loaded runs up to the render window, then the fork separator at the
     very top when `thread.parentThreadId` is set (not `inheritedRuns.length > 0`), then the own
     runs.
   - `GetThreadUseCase` and `DeleteThreadEventUseCase` stop calling `collectInheritedEvents`.
     `collectInheritedEvents` stays only for agent seeding
     (`apps/server/src/app/infra/runtime/branch-state-seed.ts:133-143`), which also reads full thread
     logs on purpose.
   - `branchThread` (`apps/webui/src/features/switch-thread/model/switch-thread.ts:76-107`) drops the
     follow-up `getThread` call; the child starts empty and shows the fork separator. Its
     `titleSource(events, forkAt)` reads the loaded window, so a fork of a message that is not in the
     loaded window falls back to the run-text scan (already the behavior).
   - `inheritedEventCount` stays in the DB and in `ThreadRecord` for informational use; the UI stops
     reading it. From Phase 2 on, every `ThreadPublic` response sets `inheritedEventCount: 0`,
     because the payload no longer contains inherited events. A stale client must not set a feed
     boundary that does not match the events it gets.
5. Load earlier UI
   - `thread-panel.tsx` keeps a `renderSize` state (12) independent of the loaded window.
   - Click: if `renderSize < ownRuns.length`, expand instantly; else `await loadEarlier(threadId)`,
     then expand and restore the anchor.
   - `hiddenLoaded = Math.max(0, ownRuns.length - renderSize)`;
     `hiddenTotal = hiddenLoaded + (window.hiddenRunsBefore ?? 0)`; show the count only when
     `window.hiddenRunsBefore !== null`.
   - Reset `renderSize` to `TAIL_RUNS` when the viewport returns to the end (`isViewingAtEnd`),
     matching the "return to tail" behavior in section 6.1. **[rev3]**
   - Prefetch: reuse the `onScroll` prop of `MessageScrollerViewport`, throttled, one request per
     boundary.
   - Keep `usePrependRestore`; pass the render size as today.

### 6.6 Spawn tabs and inspector

Both widgets currently derive data from the loaded feed and would silently lose older data.

- `SpawnView` (`apps/webui/src/widgets/chat-transcript/ui/spawn-view.tsx:36-83`):
  - Replace `useThreadEvents` + `useThreadFeeds` + `spawnSubtreeIds` with one query:
    `getRunSubtree(threadId, spawnId)` on mount/tab open.
  - `listRunSubtree` on the port returns all events of the run and its descendants plus the parent
    run's `agent.spawned` events (the spawn descriptor lives on the parent run; filter by `spawnId`
    in the client). SQL: recursive CTE over `runs.parent_run_id`; the parent descriptor is
    `run_events WHERE run_id = (SELECT parent_run_id FROM runs WHERE run_id = ?) AND type = 'agent.spawned'`.
    The use case verifies `run_id` belongs to the thread (foreign run is 404) and projects the
    result; if the projected payload exceeds `THREAD_HISTORY_PAGE_MAX_BYTES`, truncate to the most
    recent events that fit and return `outputTruncated` — a spawn subtree is normally small, but it
    must not be an unbounded read. **[rev3]**
  - Build the transcript with `splitRuns(events)` and the spawn header with the existing
    `spawnProcess`/`spawnSnapshot` fold over those events. No dependency on the thread window or the
    LRU state.
- `files-pane.tsx` (`ThreadFilesSection`):
  - Uploads keep using `listThreadAttachments` (server table).
  - Artifacts come from `getThreadArtifacts(threadId)` instead of `collectThreadAttachments(feeds)`.
  - The server extracts them from completed tool events (`listToolEvents` on the port, deduped by
    attachment id) using the parser moved from
    `apps/webui/src/widgets/chat-transcript/ui/file-artifact.ts` and `image-artifact.ts` into
    `packages/studio-shared` as pure functions, so server and client share one parser. The response
    item is `{ attachmentId, name, mediaType, sizeBytes? }`. This is a one-off user action on the
    inspector, not a polled query; an unbounded scan of the thread's tool events is acceptable here
    (measured against the largest thread in the benchmark recipe).
  - `collectThreadAttachments(feeds)` is reduced to `collectRunAttachments(run)` for per-run
    rendering and stops feeding the inspector.

### 6.7 Issue journal

`apps/webui/src/widgets/thread-journal/ui/thread-journal.tsx:60-163`:

- Use `useThreadFeed(threadId)` and the same render-window state as `ThreadPanel`.
- Use the same `Load earlier` component and `loadEarlier(threadId)`.
- `runTask` scans `run.events`; pages are whole runs, so it keeps working.

### 6.8 Issue rerun

`apps/webui/src/features/send-message/model/reload-issue-task.ts:12-26`:

- Use `firstUserThreadSeq` from the loaded window. If it is not in the local log, fetch it with the
  existing `getThreadEvent(threadId, seq)` (`apps/webui/src/shared/api/threads.ts:102-107`), check
  `isIssueHumanText`, and only then delete. If it is not an issue task, fall back to the current scan.
- Document the assumption that an issue thread's task is its first user event; if that ever changes,
  move the lookup server-side.

### 6.9 Remove the full read path

The client stops using `getThread` in Phase 2. The route stays for one release as a compatibility
shell, then is deleted in Phase 3.

- Client: delete `getThread` (`shared/api/threads.ts:95-100`) and `setThreadPinned` (`:298-300`);
  `ensureThreadCached` switches to `getThreadSummary`. The 404 fallback from 6.4 remains until
  Phase 3. **[rev3]**
- Server (Phase 2): `GetThreadUseCase` keeps the route but delegates to
  `GetThreadHistoryUseCase` (tail) and returns `ThreadPublic` with the tail page events (last 20 root
  runs, no inherited events, `inheritedEventCount: 0`) and the current summary. An old tab renders a
  correct tail instead of a 404.
- Server (Phase 3): delete `GetThreadUseCase`, its provider, and `@Get(':threadId')`.
- Keep `toThreadPublic` for `create-thread.use-case.ts:104`, `mark-thread-read.use-case.ts:50`
  (`events: []`). `toThreadPublicForAgent` has no callers at v0.10.25 — delete it with its export,
  unless a grep finds a caller; do not keep dead symbols. **[rev3]**
- Grep for `getThread(`, `GetThreadUseCase`, `toThreadPublicForAgent`, `copyEvents`, and
  `historyLoaded` and confirm zero matches outside the deleted files.

### 6.10 Phase 2 acceptance

Automated:

- Typecheck, biome, server boot (including the `runs_thread_idx` index and the
  `thread_log_deletions` table on an existing org DB).
- **`EXPLAIN QUERY PLAN` gate**: run the `listPage` root-select, the recursive CTE, and the sync
  `listAfter` against the live org DB (133k events). The root-select must not degrade to a
  correlated `MIN(thread_seq)` scan of all a thread's events on every page. If it does, the fallback
  is decided now, not later: add `runs.start_thread_seq` (set at run creation) and make page
  selection index-only on `(thread_id, parent_run_id, start_thread_seq)`. Record the chosen plan in
  the PR. **[rev3]**
- **Page-apply perf gate**: `applyHistoryPage` and `applyThreadSync` must complete in ≤ 30 ms at a
  50 000-event loaded log (benchmark recipe, section 12). If the gate is missed, `feedUpdate` must be
  made incremental (append/prepend decision) as part of this phase — the requirement is in the plan
  now so the decision is not a last-minute workaround. **[rev3]**
- Update the minimum specs (they are pure logic and must be in place **before** the phase merges,
  not after a hand test — the hand-test gate applies to features, these pin history-correctness
  invariants): **[rev3]**
  1. `reconcileSnapshot` with `windowStart`: keeps older events, appends the delta, and keeps a
     straddling stream slot without text loss; the per-identity text assertion passes on fixtures
     and a deliberately-interrupted delta.
  2. Page picker over a fixture with root runs, a spawned child, and an interleaved map worker:
     whole runs, preceding user events included, `hiddenRunsBefore` correct, no run cut across
     pages, and an orphan root (parent row removed) still appears.
  3. Compaction coverage by `coveredUntilThreadSeq` over a windowed slice, including `null`
     (unresolved, no dimming) and a legacy anchor (`undefined`).
  4. `firstLiveRunIndex` over a window with a boundary outside the loaded slice.
  5. `normalizeThreadEvents` keeps one `model.stats` and coalesces deltas.
  6. `applyDeletions` drops open-ended and closed ranges and leaves events below the window min
     untouched. **[rev3]**
- Delete the server projection spec case that asserted `dropSupersededStats` (logic moved to the
  client).

Manual:

- 500+ run thread: cold open fast; "Load earlier" expands instantly for the first 8 clicks, then one
  request per 20 root runs; scroll does not jump; the count decreases by 20; prefetch fires near the
  top; returning to the tail resets the render window. **[rev3]**
- Reload the tab mid-history: land at the end, history tail only, no giant payload.
- Unread: scroll up, receive a message, badge and separator are correct; reload keeps them; after a
  delete the separator reappears (overwrite, not monotonic). **[rev3]**
- Compaction divider and dimming are correct after a page-up; undo restores without a full reload;
  after undo the next sync does not reload the window.
- Fork: child shows only its own events, separator at the top, "Open parent" works.
- Delete a user message after loading older pages: all events from `fromThreadSeq` are dropped,
  earlier pages remain and are not reloaded.
- Issue journal: tail, load earlier, rerun task.
- Tool output "load full" still works via `/events/:seq` after pages (`tool-line.tsx:145-158`).
- Spawn tab: open from the tail, then scroll far up and switch agent threads until the parent window
  is evicted; the spawn tab still renders its transcript. Reload the app with the spawn tab
  restored: same.
- Inspector files: open a thread whose artifacts are older than the loaded page; the list still
  shows them.
- Multi-tab: delete a message in tab A; idle tab B heals via the `thread-log-changed` frame without
  reopening and keeps its loaded pages. **[rev3]**
- Memory: open 10 threads with a few pages each; the heap stays bounded and switching back stays
  fast; mounted threads are never evicted mid-view; a never-opened thread's tail stays capped.
  **[rev3]**
- Error path: stop the server, click "Load earlier", retry after the server returns; the scroll
  position is unchanged. Point the client at a server without `/history` (rollback): the 404
  fallback still opens the thread. **[rev3]**

### 6.11 Rollout and rollback

No feature flag. Phase 2 ships server and client together in one release as a sequence of revertable
commits; desktop auto-update keeps them in sync. The legacy `GET /threads/:id` returns the tail page
for one release (section 6.9), so an already-open browser tab keeps working with a bounded payload.
The new client falls back to the legacy route on 404 (section 6.4). Do not delete the legacy route
in the same release as the client switch; deletion is Phase 3.

Rollback: revert the phase commit(s); the legacy route and the dual-shape mutation client keep older
bundles alive, and the 404 fallback keeps a newer bundle alive against a rolled-back server.

## 7. Phase 3: polish

- Deep link to a message: support `?aroundThreadSeq=N` in the history endpoint (page containing the
  seq, `hasMoreBefore`/`hasMoreAfter`), add a route query param, scroll via
  `useMessageScroller().scrollToMessage(id)` with `Item.messageId` (the primitive supports both;
  `apps/webui/src/features/send-message/model/scroll-requests.ts` stays as the request plumbing).
  **[rev3]**
- Phase 3: delete the legacy `GET /threads/:id` route, `GetThreadUseCase`, the legacy mutation
  response branch and the `?shape=v2` opt-in, the dual-shape mutation fallback in `delete-turn.ts`,
  the 404 fallback in `getThreadHistory`/`getThreadSummary`, and `reconcileEvents` if still present.
- `CLIENT_TRACE=1` timing around cold open, sync, and page load (`apps/webui/src/shared/lib/trace.ts`),
  so future regressions are visible.
- Optional: remove `inheritedEventCount` from `ThreadPublic`/`ThreadSummary` and the client mapping
  once nothing reads it; keep the DB column.
- Optional: `runs(parent_run_id)` index if spawn subtrees become a hotspot.
- Optional: server-side thread search (not part of this plan).
- Optional: persist the pin (today it is local-only and lost on reload).
- Optional: prune `thread_log_deletions` rows whose range is below a retained-watermark thread seq
  (only after a client min-cursor is tracked server-side; without it, pruning can hide a deletion
  from a very old client). Not in scope. **[rev3]**

## 8. Verification gates

Every phase:

```bash
cd apps/webui && bun test src/entities/session/model
cd apps/webui && bun run typecheck
cd apps/server && bun run typecheck
bunx biome check <touched files>
```

Server changes: boot the server and wait for a successful boot (DI metadata erasure is only visible
at boot). Boot against an existing org DB so the `thread_log_deletions` table and `runs_thread_idx`
index are created. Use the dev stand or a one-off run on an isolated port with its own
`DEV_HARNEYSYS_HOME`; never touch the live stand.

Phase 2 adds the `EXPLAIN QUERY PLAN` gate and the page-apply perf gate (section 6.10), both
recorded in the PR.

Manual checks: sections 5.8 and 6.10. Do not write new behavioral tests before the hand test; the
six specs listed in 6.10 are the allowed minimum because they pin history-correctness invariants and
would otherwise require temporary scripts.

## 9. Risk register

| Risk | Mitigation |
| --- | --- |
| A page starts mid-run and the render shows half a turn | Pages are fetched by run id (root + descendants), not by a seq interval; test 2 in 6.10 |
| A page starts with an assistant run but without its user message | Walk down over preceding `run_id IS NULL` events, stop at the first `user` event, capped at `PAGE_BOUNDARY_MAX` |
| Spawn runs counted as turns | Pages and `hiddenRunsBefore` count only root runs (including orphans); descendants are fetched with the root |
| An orphan run (parent deleted by `deleteEmptiedRuns`) vanishes from pages | Orphan-aware root predicate in `listPage` and `hiddenRunsBefore`; test 2 in 6.10 |
| `reconcileSnapshot` drops older pages or loses text on a delta | `windowStart` option plus the straddling-slot suffix rule; dev text assertion; test 1 in 6.10 |
| Client cursor lags behind SSE, so sync re-downloads a run | `applyBatches` advances `maxThreadSeq` from live events; sync is chunked |
| A delete in another tab is invisible or collapses the window | `thread_log_deletions` ranges + `thread-log-changed` SSE frame; precise drop, no reload; `reset` only when the journal exceeds `THREAD_SYNC_MAX_DELETIONS` |
| Sync delta exceeds the cap and the client resets | `hasMore` chunked loop; the client loops to `serverMax`, never reloads on size |
| Reconnect resync returns more than the range cap | `kind: 'range'` + `hasMoreAfter` chunking; a straddled range (invalid bounds) is the only `kind: 'tail'` reset |
| A reset loop after truncation/undo | Mutation responses return `cursor`; `threads.last_thread_seq` is never rewound |
| Forked threads keep inherited `thread_seq` values | Phase 1 uses the full path for `fullOnly` windows (bounds `0`, never read); Phase 2 removes inherited events and returns `inheritedEventCount: 0` |
| Unread separator wrong after paging or after a delete | `viewedSeq` in thread seq, `markViewed` overwrites (not monotonic); legacy key dropped |
| Compaction divider disappears | `coveredUntilThreadSeq` when numeric; `null` = unresolved (no dimming); legacy `undefined` falls back inside the window |
| Run remounts and scroll jumps on prepend | `firstThreadSeq` keys; `preserveScrollOnPrepend` (verified in `@shadcn/react@0.3.1`) + `usePrependRestore` |
| Render window grows unbounded | `renderSize` resets to `TAIL_RUNS` on return to tail |
| Old browser tab breaks after deploy | Legacy full route returns a degraded tail for one release; mutation client accepts both shapes |
| New browser tab breaks against a rolled-back server | 404 fallback to the legacy route for `/history`/`/summary` |
| Spawn tab or inspector loses old data | Server-side subtree and artifacts endpoints (6.6), subtree projected and capped, run ownership checked |
| Memory grows with many threads | 50k window budget + `LIVE_TAIL_MAX_EVENTS` tails; eviction of non-mounted/non-active only, soft cap |
| Never-opened threads accumulate events | Two-tier model: SSE feeds a capped tail, not an unbounded log; `resyncThreadEvents` iterates windows only |
| Page apply janks at the budget | Perf gate (≤ 30 ms at 50k events); incremental `feedUpdate` is the pre-agreed fallback |
| Page selection scans the thread on every page | `EXPLAIN QUERY PLAN` gate; `runs.start_thread_seq` denormalization is the pre-agreed fallback |
| `hiddenRunsBefore` disagrees with rendered runs | Advisory number, hidden when `null`, never `0` while the button shows; recomputed after a byte-cap retry |
| Issue task not found after paging | `firstUserThreadSeq` + `getThreadEvent`; scan fallback |
| Deletion journal grows unbounded | One row per destructive action; optional watermark pruning is deferred (Phase 3 optional) with the trade-off documented |
| Server/client version skew | One release per phase, additive server routes, legacy route kept one release, 404 fallback |

## 10. File change index

New (server):

- `apps/server/src/app/domain/thread/thread-history-page.port.ts`: `ThreadHistoryPagePort`,
  `ThreadHistoryPageRequest`, `ThreadHistorySlice`, `ThreadSyncSlice`, `ThreadLogDeletion`.
- `apps/server/src/app/infra/org-sqlite/schema/thread-log-deletions.ts`: `threadLogDeletionsTable`.
- `apps/server/src/app/infra/thread/thread-history-page.adapter.ts`: `ThreadHistoryPageAdapter`.
- `apps/server/src/app/application/threads/thread-summary.assembler.ts`: `ThreadSummaryAssembler`.
- `apps/server/src/app/application/threads/sync-thread-events.use-case.ts`: `SyncThreadEventsUseCase`.
- `apps/server/src/app/application/threads/get-thread-history.use-case.ts` (Phase 2).
- `apps/server/src/app/application/threads/get-thread-summary.use-case.ts` (Phase 2).
- `apps/server/src/app/application/threads/get-run-subtree.use-case.ts` (Phase 2).
- `apps/server/src/app/application/threads/list-run-artifacts.use-case.ts` (Phase 2).

New (client):

- `apps/webui/src/entities/session/model/normalize-events.ts`: `normalizeThreadEvents`.
- `apps/webui/src/entities/session/model/apply-deletions.ts`: `applyDeletions` (or a store helper).
- `apps/webui/src/features/desk/model/load-earlier.ts`: `loadEarlier`, `loadEarlierInflight`.
- `apps/webui/src/widgets/chat-transcript/model/load-earlier-trigger.ts` (Phase 2): scroll prefetch.

Modified (server):

- `packages/contracts/src/thread.ts`: sync, history, mutation schemas, constants, `ThreadLogDeletion`.
- `packages/contracts/src/domains-work.ts`: exports.
- `apps/server/src/app/api/rest/threads.controller.ts`: sync, history, summary, subtree, artifacts;
  legacy `get` shell; mutation shapes.
- `apps/server/src/app/api/rest/thread-compact.controller.ts`: undo response.
- `apps/server/src/app/application/threads/thread.use-case.module.ts`: providers.
- `apps/server/src/app/application/threads/get-thread.use-case.ts`: assembler, tail shell, then delete.
- `apps/server/src/app/application/threads/mark-thread-read.use-case.ts`: assembler.
- `apps/server/src/app/application/threads/delete-thread-event.use-case.ts`: `eventAt` lookup,
  response shape, no full log, publish `thread.log-changed`.
- `apps/server/src/app/application/threads/undo-thread-compact.use-case.ts`: response shape, publish
  `thread.log-changed`.
- `apps/server/src/app/application/threads/thread-events-projection.ts`: slice-pure (stats dedupe moved).
- `apps/server/src/app/application/threads/thread.helpers.ts`: delete `toThreadPublicForAgent` (dead).
- `apps/server/src/app/domain/thread/thread-repository.port.ts`: `threadHasRuns`.
- `apps/server/src/app/domain/thread/local-executor.port.ts`: no change (deletion journal written in
  `sqlite-thread-truncate.ts`, already under this port).
- `apps/server/src/app/infra/thread/thread.module.ts`: adapter provider and export.
- `apps/server/src/app/infra/thread/thread-repository.adapter.ts`: `threadHasRuns`.
- `apps/server/src/app/infra/org-sqlite/org-sql.ts`: `thread_log_deletions` DDL, `runs_thread_idx`.
- `apps/server/src/app/infra/org-sqlite/schema/index.ts`: export the new table.
- `apps/server/src/app/infra/runtime/sqlite-thread-truncate.ts`: insert deletion ranges in both
  mutations.
- `apps/server/src/app/infra/events-watch/events-watch-bridge.ts`: bridge `thread.log-changed`.

Modified (client):

- `apps/webui/src/shared/api/threads.ts`, `apps/webui/src/shared/api/index.ts`,
  `apps/webui/src/shared/api/events.ts` (`watchThreadLogChanged`).
- `apps/webui/src/entities/session/model/session.store.ts`, `session-batches.ts`,
  `reconcile-snapshot.ts`, `live-tail.ts` (tail cap + anchors).
- `apps/webui/src/entities/session/model/feed/feed-engine.ts`, `feed-hooks.ts`, `feed-types.ts`,
  `feed-run-fold.ts`, `feed-run-publish.ts`, `feed-run-drafts.ts`, `compaction-coverage.ts`.
- `apps/webui/src/entities/session/index.ts`.
- `apps/webui/src/features/desk/model/refresh-thread.ts`, `features/desk/ui/desk-sync.tsx`,
  `features/desk/model/apply-desk-event.ts` (summary-only `thread` event), `features/desk/index.ts`.
- `apps/webui/src/features/send-message/model/thread-events.ts`, `delete-turn.ts`,
  `reload-issue-task.ts`.
- `apps/webui/src/features/compact-thread/model/compact-thread.ts`, `undo-compact.ts`.
- `apps/webui/src/features/switch-thread/model/switch-thread.ts`.
- `apps/webui/src/widgets/chat-transcript/model/thread-sync.ts`, `tail-slice.ts`,
  `unseen-boundary.ts`, `use-unseen-count.ts`, `use-prepend-restore.ts`.
- `apps/webui/src/widgets/chat-transcript/ui/thread-panel.tsx`, `thread-panel-aux.ts`,
  `spawn-view.tsx`, `tool-group.tsx`, `tool-line.tsx`, `run-attachments.tsx`, `fork-separator.tsx`,
  `chat-transcript.tsx` (mounted set → `trimHistoryCache`).
- `apps/webui/src/widgets/thread-journal/ui/thread-journal.tsx`.
- `apps/webui/src/widgets/ide-content/ui/ide-content.tsx`.
- `apps/webui/src/widgets/project-sidebar/model/thread-actions.ts`.
- `apps/webui/src/widgets/agent-inspector/ui/files-pane.tsx`.
- `apps/webui/src/features/desk/model/use-agent-live-status.ts`, `use-desk.ts` (status over the
  bounded tail/window; drop the `WeakMap` caches).
- `packages/studio-shared`: artifact parsers moved from
  `apps/webui/src/widgets/chat-transcript/ui/file-artifact.ts` / `image-artifact.ts`.

Deleted (client):

- `setThreadPinned`, `getThread`, `useThreadFeeds`, `useInheritedFeed`, `feedSetBoundary`,
  `setThreadFeedBoundary`, `historyLoaded`, `saveViewedCount`/`loadViewedCount` (replaced by the
  store-owned `viewedSeq`), `reconcileEvents` (Phase 2), `copyEvents` (Phase 2).

Deleted (server):

- `apps/server/src/app/application/threads/get-thread.use-case.ts` (Phase 3).
- `toThreadPublicForAgent` (Phase 2, no callers).

## 11. Explicit decisions

- Fork UX: separator plus "Open parent"; no inline parent history. Confirmed by the user
  2026-11-23.
- Page unit: root run plus its descendant subtree (roots include orphans). Page size 20 root runs,
  1.5 MB projected cap. Render window: 12 runs, resets on return to tail.
- Cold open shows the tail page; no "load all".
- `Load earlier`: instant expansion inside loaded pages, network only at the page boundary,
  background prefetch at 600 px from the top.
- `hiddenRunsBefore` is exact and replaces `totalRuns`; the client shows no number when it is
  `null`; recomputed after a byte-cap retry.
- Unread is stored as a thread seq under a new key; `markViewed` overwrites; legacy counts dropped.
- `resync` (SSE gap, reconnect) uses a range reconcile, chunked on `hasMoreAfter`; regular terminal
  events use chunked sync.
- Delete/undo return small mutation responses with a fresh `cursor` behind an explicit `?shape=v2`
  opt-in; the client updates locally and falls back to the legacy payload. Every destructive write
  records a `thread_log_deletions` range and publishes `thread.log-changed`.
- A deletion heals precisely (drop range + re-sync); the client only reloads its whole window when
  the deletion journal exceeds `THREAD_SYNC_MAX_DELETIONS` (pathological) or the loaded bounds are
  invalid by construction (straddled range).
- Forks use the full snapshot path in Phase 1 (bounds `0`, never read); Phase 2 removes inherited
  events from the payload and sets `inheritedEventCount: 0`.
- The legacy `GET /threads/:id` stays for one release as a tail-only compatibility shell; the new
  client falls back to it on 404.
- Spawn tabs and the inspector read from dedicated endpoints (subtree projected and capped, run
  ownership checked), not from the loaded window.
- Memory: 50k event window budget plus a per-thread capped live tail (`LIVE_TAIL_MAX_EVENTS`);
  mounted, focused, and active windows are never evicted.
- A thread with no window keeps only a capped live tail for sidebar status; it is never refetched
  during a reconnect.
- No runtime flags; one release per phase; Phase 2 is a sequence of revertable commits.
- No polling, no virtualization, no agent-context changes.
- History-correctness specs (6.10 tests 1-6) merge with the phase, before the hand test.

## 12. Benchmark recipe

The Phase 0 numbers were produced with a temporary Bun script (not committed) that:

1. Opened the org DB read-only with `bun:sqlite`.
2. Ran `select e.*, r.agent_id, r.agent_name from run_events e left join runs r on r.run_id = e.run_id where e.thread_id = ? order by e.thread_seq`.
3. Mapped rows with the same `rowToEvent` shape as
   `apps/server/src/app/infra/runtime/sqlite-thread-truncate.ts:17-32`.
4. Called `projectThreadEvents` from
   `apps/server/src/app/application/threads/thread-events-projection.ts:109`.
5. Timed `fillSeenAt`, `reconcileSnapshot`, and `feedUpdate` from the real client modules.

Extend the recipe in Phase 2 with: (a) `EXPLAIN QUERY PLAN` for the `listPage` root-select and
`listAfter`, and (b) a 50 000-event synthetic log to time `applyHistoryPage` and `applyThreadSync`
against the 6.10 perf gate.

To reproduce after future changes, reuse the same modules and compare payload bytes
(`Buffer.byteLength(JSON.stringify(projected))`) and the timings. The acceptance numbers are in
sections 4 and 6.10.
