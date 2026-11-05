# Stage 3 — WebUI transport & dispatcher (research preserved)

Source: child session `ses_e552558ffffej04DGP9Fj2zHkI`, Stage 3 task. Saved because the session hit the free-model usage cap mid-execution after writing only `apps/webui/src/shared/api/sse-state.ts`.

## What was studied

- `refactor.md` §"Этап 3", `docs/HARNESS_CHANGE_CRITERIA.md`, Stage 1/2 server code: `events-watch.controller.ts`, `events-watch-bridge.ts`, `events-watch-hub.ts`, `events-watch.frames.ts`, `thread-events.port.ts`, `ThreadEventsPort`, `org-runtime-publish.ts`, `org-runtime.ts`, `observe-thread-errors.ts`.
- `packages/studio-shared/src/events-watch.ts` (new `orgId`, `thread-events`, `resync` frames) and `packages/harnesys/src/ports/session-events.ts`, `transcript.ts` (`SessionEvent` union: `run.started`, `run.completed`, `run.failed`, `run.cancelled`, `user`, `ask`, `error`, `agent.handoff`).
- WebUI transport/events: `shared/api/sse.ts`, `shared/api/events.ts`, `shared/api/threads.ts`, `shared/api/active-org.ts`, desync consumers `features/desk/ui/desk-sync.tsx`, `features/desk/ui/org-desk-sync.tsx`, `features/ide/model/ide-sync.ts`.
- Store model: `entities/session/model/session.store.ts` (`appendEvent`, `startRun`, `finishRun`, `reconcileEvents`, `markUnread`, `discardDelivered`, `maybeMarkUnread`, `setFailure`, `activeRunId`), `entities/thread/model/thread.store.ts`, `entities/org-machine/model/active-org.store.ts`, `entities/org-machine/model/active-org.ts`.
- Send-message machinery: `models/client-registry.ts`, `run-stream-client.ts`, `send-message.ts`, `hitl-actions.ts`, `pending-hitl.ts`, `delete-turn.ts`.
- Transcript UI: `widgets/chat-transcript/model/thread-sync.ts`, `widgets/chat-transcript/model/use-spawn-stream.ts`, `map-items.tsx`, `spawn-line.tsx`, `spawn-view.tsx`.
- Composer: `widgets/chat-composer/ui/chat-composer.tsx`, `composer-chrome.tsx`, `composer-trailing-controls.tsx`. `hitl-prompt.tsx`, `thread-run-status/ui/retry-banner.tsx`.
- Run lifecycle: chat transcript events, `apply-incoming.ts` (dedupe by `runId:seq`, order-sensitive), `desk store sync`, org activity store.
- Callers of run-stream symbols: `connectThreadRun`, `connectLiveRun`, `connectRunStream`, `useSpawnStream`, `useRunStreamState`, `getClientForRun`, `createRunStreamClient`, `getRunEventsStream` (only run-stream-client).

## Key findings

- The old transport `readSse` does not parse `id:`; `SseFrame` lacks `id`.
- `connections` keyed by URL only; one shared stream does not carry org; `watchEventSource` resolves org via `getActiveOrgId()` global. To support per-org streams, key must become `${url}::${orgId}` and header `X-Org-Id` must be sent.
- `useActiveOrgStore.orgs` is defined but never populated anywhere in the codebase; `setOrgs` is never called. For all-org subscriptions, either populate this store (best in `OrgProvider` via effect mirror of context `orgs`) or fall back to `useOrgStore()` in `DeskSync`.
- `EventsWatchThreadEventsFrame` carries `{ orgId, threadId, events }` but no `runId`; each `SessionEvent` carries its own `runId`/`seq`.
- Events are delivered from server via both `admit()` pre-append and `onAppend`; duplicates expected and already deduped by `runId:seq` in `applyIncomingEvents`. Dispatcher must preserve arrival order and not drop duplicates itself.
- Live deltas lack `threadSeq` until append; terminal events drive `finishRun` + reconcile + `markUnread` + org-activity bump for inactive orgs.
- `thread-error` is still required for `setLastError`/`markUnread`/`syncThreadsFromServer`; must not call `refreshThread`; `run-finish` is dead.
- React Compiler is on; no manual `useMemo`/`useCallback` for perf.
- `orgId` for non-thread watchers remains active-org scoped.

## Derived action plan (intended execution order)

1. Extend SSE transport (`sse.ts`) and connection-state store (`sse-state.ts` done):
   - `SseFrame.id?: string`; `readSse` parses `id:` lines and updates `conn.lastId` per frame.
   - `watchEventSource(url, event, onData, options?: { orgId })`: connection key `${url}::${orgId ?? getActiveOrgId() ?? ''}`, send `X-Org-Id`, send `Last-Event-ID` from `conn.lastId`, `open/onError`, keep `onOpen` semantics.
   - On HTTP 400 while a cursor exists, reset `lastId` and retry once without it.
   - Keep keep-alive/reconnect/backoff; no polling.
2. Update event watchers (`events.ts`):
   - `watchThreadEvents(orgId, onFrame)` for topic `thread-events`.
   - `watchDeskEvents(orgId, onEvent)` (org-scoped), update callers.
   - `watchResync(orgId, onResync)` for topic `resync`.
3. Add `thread-events.ts` dispatcher + `run-actions.ts` + `use-run-state.ts`; rewrite `send-message.ts`, `hitl-actions.ts`; patch `thread-sync.ts`; delete `use-spawn-stream.ts`, clear run clients.
4. Wire `DeskSync` to subscribe `thread-events` + `desk` for every org; keep other topics active-org scoped; remove `refreshThread` from `thread-error`.
5. Update `chat-composer.tsx` to use `useRunState`; final grep/typecheck/lint/tests/health.

## Status at interruption

- Completed: read all referenced files and designed the plan; created `apps/webui/src/shared/api/sse-state.ts` (`useSseConnectionStore`, `setSseConnectionState`).
- Not started: remaining `sse.ts` changes, watchers, dispatcher, run-actions, deletions, wiring.
- Open follow-ups: whether to populate `useActiveOrgStore` in `OrgProvider` or read from `useOrgStore()` in DeskSync; resync real-world handling (refresh open thread / inbox); deriving `useRunState` state from `activeRuns`/`ask`/connection state.

## Constraints carried over

English-only UI text (existing RU comments avoided in new code); mandatory types `export type`; no default exports; ~300 lines/file (350 hard max); no `any`/non-null assertions; no polling; keep server old SSE path intact until Stage 4.
