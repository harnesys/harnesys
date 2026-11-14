# Bug Report: Telegram Groups ↔ Threads Full Mirror (v1.4.0)

Status: broken on first clean hand-test. Hand off to a fresh agent. Do not assume any part of the mirror works without re-verifying.

## Original Plan (the spec this work was built against)

1. **Single source of truth for who answers**: `responderMode: 'auto' | 'mention'` lives on `ThreadPolicy` (thread settings page + Connect form are two handles on the same setting). No addon-level routing policy.
   - `auto` — pinned agent answers every unaddressed message.
   - `mention` — only explicit @mentions / replies start a run; unaddressed messages are stored in the transcript with `no_responder`, no run.
2. **Full two-way mirror**: ALL messages of a connected group/topic mirror into the bound thread (no transport-side filter); messages typed in Harnesys threads relay back to the transport (relay on `user` SessionEvents in `TransportSessionService`, skip `connector:` origins, `appEchoText` attribution).
3. **Routing card** on the addon settings page fed by `GET /bindings`: target, agent, thread, mode, channel, updatedAt, plus **Unbind** action.
4. **Generic SDK seams** (no telegram literals in core): `threads.get` / `threads.patch` (`threads.read` / `threads.write`), `agents.list` (`agents.read`), `threads.create` with `kind` / `responderMode`.
5. **Connect form**: group + topic pickers, responder mode, agent, thread title. Connect creates the thread and a `connections` row.
6. Migration `backfillThreadsResponderMode` sets `auto` on all legacy threads; `CreateThreadUseCase` stores the mode explicitly at creation.

## Implemented (code that exists and gates green)

- Core: `responderMode` in `packages/contracts/src/thread.ts`; `responderModeOf` / `autoFallback` in `apps/server/src/app/domain/thread/`; chat gate + `storeUnaddressedMessage` in `apps/server/src/app/application/threads/send-thread-run-helpers.ts`; backfill in `apps/server/src/app/infra/org-sqlite/org-sql.ts`.
- Relay out: `mirrorUserMessage` in `apps/server/src/app/infra/addons/sessions/transport-session.service.ts` (works — app messages reached Telegram in the test).
- SDK: `packages/sdk/src/protocol/thread-service-methods.ts` + spread in `map.ts`; `AddonThreads.get/patch`, `AddonAgents.list`; host services `apps/server/src/app/infra/addons/services/threads/threads-service.ts` and `.../agents/agents-service.ts` (registered in `services/index.ts`, `dispatcher.module.ts`, `permission-definitions.ts`).
- Addon: `add-ons/harnesys.telegram-groups/` — migration `0003_connections.sql`, routes `connect` + `bindings`, `inbound.ts` full-mirror rewrite, manifest v1.4.0, dist built.
- WebUI: responder-mode select in `apps/webui/src/features/manage-thread-members/ui/thread-settings.tsx`.

All tests green (addon 31, SDK 63, server threads/domain 57) and tsc/biome clean — **green gates did not catch the runtime bugs below.**

## Bugs from the 2026-11-14 clean hand-test

### B1 — Inbound mirror does not work at all (blocker)
- Setup: clean DB, connected topic "Новый топ" (topic 149) of group `-1004334557990` to thread 777, mode auto, agent Genie. Connect created the topic, the thread, and the connections row.
- Message posted in Telegram General topic ("привет") — thread stayed empty. A later message with @bot mention in topic 149 also never appeared.
- Outbound relay works (app messages appear in Telegram), so the failure is the inbound path only.
- Investigate (ordered): (a) is the poller receiving updates at all; (b) does `resolveChannel` in `inbound.ts` match the binding `-1004334557990:149` for General-topic messages (topic→group fallback was supposed to exist — verify it actually fires); (c) does `bridge.inbound` reach `NeutralBridgeInboundUseCase` and does `connectorOrigin` passthrough survive to run dispatch; (d) is the installed addon process running the rebuilt dist (reinstall v1.4.0 and confirm via logs) — the live stand was running old dist for part of the session.

### B2 — Connect form conflates two orthogonal concepts (design defect)
- The select option "Mirror all, agents answer on @mentions" ties mirroring to `mention` mode. Wrong model: **mirroring is unconditional for every binding** (group, topic, or chat); responder mode only decides who answers.
- Redesign the form semantics: mirror is not a selectable option at all; the mode select must only express auto vs mention, and the thread kind (dedicated thread vs shared group thread) must not be implied by the mode label. Rework label, help text in `addon.json` (`mode` field), and the connect handler in `src/routes.ts` (currently `auto` → chat thread, `mention` → group thread — revisit this coupling).

### B3 — Stale topic list in the Connect form
- After the user deleted/recreated topics in Telegram, the topic combobox still lists old topics (`Code`, `Genie Topic`, `Topic 128`, `Мой новый топик 133`). Discovered topics come from the addon `topics` route backed by the addon DB; the list must reflect reality (refresh on dialog open, `dependsOn: chat` reload) and prune topics that no longer exist.

### B4 — Routing table does not update after connect
- Submit succeeded (toast "Connected …") but Routing stayed "No rows" until a full page reload. The table must refetch after the connect form submits (descriptor-forms flow in `apps/webui/src/features/manage-addons/`).

### B5 — No Unbind action on routing rows
- Each Routing row needs an Unbind action: deletes the `connections` row (and decide whether the thread is unlinked or archived). Add a `POST /unbind` route (or similar) and wire it into the table widget.

### B6 — Lifecycle semantics undefined
Define and implement behavior for:
- topic deleted in Telegram → row dead; mark/propagate (thread stays, binding marked disconnected);
- group deleted / bot removed → all rows for that chat marked disconnected;
- thread deleted in the app → connection must be dropped (mirror target gone), not crash the addon;
- unbind → stop mirroring immediately.
No behavior currently exists for any of these — decide the contract first, then implement (likely a cleanup in the poller + a guard in `handleGroup`).

## Known migration gap
Connections made before v1.4.0 have no `connections` rows; they never bridge until reconnected. After reinstalling, every group must be reconnected manually.

## Test notes for the next agent
- Never `git stash`; branch `cleanup-legacy` is shared.
- Live stand: API :47473, web :5173, `bun --watch` — do not kill or duplicate; verify DI boots after any host-service change.
- Addon dist must be rebuilt (`bun run build` in the addon dir) after any change; the stand loads `dist/index.js`.
- Gate commands: `bun test` in the addon, `packages/sdk`, targeted server dirs; `tsc --noEmit` per package; root typecheck has pre-existing errors in other agents' zones (schedules/teams/webhooks/org-machine/toolchain-settings/org-pack-registrations) — filter, do not fix.
