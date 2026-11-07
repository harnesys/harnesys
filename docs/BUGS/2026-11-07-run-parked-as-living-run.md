# BUG: run parked on permission ask keeps rendering as "Agent is working"; ask card and correct composer state appear only after reload

Date: 2026-11-07
Status: triaged, root cause not yet proven
Severity: high — user cannot answer a pending permission ask without a page reload; the run stays parked indefinitely (no HITL timeout).

## Environment

- Harnesys dev stand, `bun --watch` server, API `:47474`, web `:5173`.
- Model `nvidia/nemotron-3.5-s…`, effort Medium, agent Default.
- Thread: "evaluate ADDON_VISION_PHASE0 document" in worktree `.worktrees/addon-platf…`.
- Evidence: 4 walk-through screenshots (live view vs view after reload).

## Symptoms

1. **Stalled live view.** While the run is live, the transcript shows thought fragments (`~1 tok`, e.g. "Н", "Пр") and intermediate messages are missing. After reload the same thread renders complete thoughts (75–124 tok) and the full message history from the DB.
2. **Ask card missing while live.** The run actually parked at a `threads_search` permission gate ("Allow threads_search? / allow read? / query ADDON_VISION_PHASE0 / scope org"). Live UI never shows this card: status stays "Agent is working", composer placeholder "Agent is running — your message will be queued…" with a red Stop button.
3. **After reload the state is correct but the Stop button is gone.** The ask card renders, composer is disabled with a send arrow, "Waiting for input…" hint. Composer Stop button disappears, although the run is not dead — it is parked (`needs_input`), and the user reads it as "the run just ended".

## Code map (webui)

- `apps/webui/src/widgets/chat-composer/ui/chat-composer.tsx:74-83` — `streaming = Boolean(activeRuns[threadId])`, `hitl = pendingHitl(events)`.
- `apps/webui/src/widgets/chat-composer/ui/composer-trailing-controls.tsx:146-195` — Stop button iff `streaming`, send arrow otherwise; `disabled = sending || Boolean(hitl)` (`chat-composer.tsx:99`).
- `apps/webui/src/features/send-message/model/use-run-state.ts:16` — run state derived as `'paused'` only when an `ask` event is present in the cached event list; otherwise `'live'`.
- `apps/webui/src/features/send-message/model/pending-hitl.ts:27-55` — ask detection from cached events.
- `apps/webui/src/entities/session/model/session.store.ts:213-258` — `activeRuns` is cleared only by client terminal events `run.completed|run.failed|run.cancelled` (`features/send-message/model/thread-events.ts:74-79`). A park to `needs_input` does **not** clear it.
- `apps/webui/src/features/desk/model/refresh-thread.ts:11` — **guard: `if (!force && activeRuns[threadId]) return null`**
- `apps/webui/src/features/desk/ui/desk-sync.tsx:175-188` — `watchThreadErrors` on `parked` calls `refreshThread(threadId)` without `force`.
- `apps/webui/src/features/desk/ui/desk-sync.tsx:197-213` — `watchApprovalEvents` on `requested` also refreshes with `force=false` (`const force = frame.type !== 'requested'`).
- `apps/webui/src/features/send-message/model/thread-events.ts:24-34` — hub resync covers only threads that already have `activeRuns` or cached events.

## Code map (server)

- Park: run transitions to `needs_input` on a permission ask (`apps/server/src/app/infra/runtime/sqlite-run-lifecycle.adapter.ts:133`, `work-executor.forwarder.ts:89`).
- `ask` session events fan out through `createOrgEventPublisher` (`apps/server/src/app/infra/runtime/org-runtime-publish.ts:58-74`) → `ThreadEventsPort` → `apps/server/src/app/infra/events-watch/events-watch-bridge.ts:146-158` → hub topic `thread-events`.
- Two extra server-side signals on park: `thread-error` event `parked` (`observe-thread-errors.ts:38`) and approval `requested` (`ApprovalEventsPort`).
- The run-scoped SSE (`thread-run-sse.ts`) breaks on `ask` and writes `run-paused`; webui does not consume it anymore ("run tracking now arrives through the unified org event hub", `send-message.ts:8`).

## Ground truth (stand evidence, `~/.harnesys/orgs/<org>/org.db`)

- Run `ed8af9fe` (thread `1c8a4673`) is parked `needs_input`, `last_seq = 187`.
- The DB contains the full ordered event stream: reasoning/text deltas seq 151–179 (all within 16:50:18 local), tool events 180–185, `model.usage` 186, `ask` 187. Server publish order is intact and ~1 s end-to-end.
- The live webui rendered the run only up to approximately seq < 140 ("продолжаю читать…" thought) and then received nothing: deltas, tool events, and the `ask` never reached the store. This is a continuous tail loss — not selective loss of the `ask` alone.
- Therefore the ask-frame loss and the truncated live thoughts (`~1 tok` fragments followed by nothing) are the same failure: the client's live channel silently stopped delivering mid-run. Server-side data is complete, which is why a reload (fresh fetch + resync) heals everything.

## Root cause analysis

**Primary: the events-watch SSE stream can die silently in both directions, with no client detection and no server-side close.**

1. Server (`apps/server/src/app/api/rest/events-watch.controller.ts:43-51`): on `controller.enqueue` failure `write()` calls `cleanup()` (unsubscribes, removes keep-alive) but never `controller.close()` / `controller.error()`s the stream. From that moment the response stays open and sends nothing; the client's `reader.read()` never rejects.
2. Server keep-alive is comment-only (`events-watch-frame.ts:7`, `KEEP_ALIVE_FRAME = ':\n\n'`), and the webui parser drops comment-only blocks (`apps/webui/src/shared/api/sse.ts:235-237`, `data.length === 0 → undefined`). The client therefore has no way to bind to heartbeat freshness and cannot detect a stalled stream — it stays in the local `streamState: 'live'` / `activeRuns` state forever.
3. `pendingHitl` never sees the `ask`, `useRunState` stays `'live'`, the composer stays "Agent is working…" with Stop. Nothing else re-syncs the thread while `activeRuns` is set (see secondary below).
4. After the user reloads, a fresh connection + resync + `getThread` restores the true parked state, and the composer flips to the ask card + send arrow without Stop — the perceived "Stop disappeared / run ended".

**Secondary: park-time recovery fans are no-ops while `activeRuns` is set.**
`thread-error: parked` (`desk-sync.tsx:175-178`) and `approval: requested` (`desk-sync.tsx:197-213`) both call `refreshThread(threadId)` without `force`, and `refreshThread` bails on any thread with `activeRuns` (`refresh-thread.ts:11`). A park does not clear `activeRuns`, so even when these frames DO arrive, the recovery fetch is skipped exactly when it is needed. (In this incident they did not arrive at all — the channel was already dead.)

**Tertiary: Stop-button state asymmetry.**
`thread-run-status-bar.tsx:38-58` keeps showing a running bar with Stop for `needs_input` (only `waiting`/`queued` count as "waiting"), while the composer keys Stop purely off `activeRuns`. Two widgets, two definitions of "running" — visible as the inconsistent Stop presence across live/parked/reloaded views.

## Fix direction (proposals, not decided)

1. Server: on enqueue failure close the stream (`controller.error(err)`), so the client's fetch rejects and the reconnect path runs (`maintainConnection` + `onOpen` resync).
2. Client: track last-reader-activity (including keep-alive comment frames) and force a close+reconnect when no bytes arrive for `SSE_KEEP_ALIVE_MS × 3`; make `readSse` yield comments so heartbeat freshness is observable.
3. Treat `needs_input` as a first-class parked state in the composer/run matrix: clear composer Stop (or keep a Resume/Cancel affordance) the moment `thread.activeRun.status === 'needs_input'`.
4. In `desk-sync.tsx`, refresh with `force: true` on `parked` and `approval.requested` (or make the `refreshThread` guard check `thread.activeRunStatus` instead of the client-only `activeRuns`).
5. Add a client watchdog: if a thread has `activeRuns` but no events/progress for N seconds and `thread.activeRun.status` disagrees, reconcile from `getThread`.
6. Server side: add gap detection to the events-watch hub stream so a lost frame always produces a `resync`.

## Repro sketch

1. Start a run that parks at a permission ask; watch the feed live.
2. Kill or stall the response stream server-side (throw once in `write`, or drop the TCP conn without RST).
3. Expected today: no resync, no reconnect, composer stays "Agent is working…" indefinitely; the ask card is visible only after page reload.
4. With fixes 1–2: the client reconnects on its own, `resyncThreadEvents` restores the missing tail, the ask card appears live.
