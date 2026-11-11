# Transport sessions: host-side projection of runs onto chat channels

Status: implemented as a host projection (`infra/addons/sessions/`), slices 1–6; the
optional channel-native `transport.stream`/`ack` slice is not built. Replaces per-addon reimplementations of the five
behaviors the legacy Telegram connector implements by hand: streaming run output
(drafts), echo suppression, HITL ask routing, resume after restart, and run cancel
via channel command.

## Existing substrate (reused, not rebuilt)

| Piece | Location | Role in this design |
|---|---|---|
| `AddonTransportBindingRepositoryPort` | `domain/addons/ports/transport-binding-repository.port.ts` | channel↔thread bindings, written by `NeutralBridgeInboundUseCase.bindAndDispatch` |
| `ThreadEventsPort` | `domain/thread/thread-events.port.ts` | full run event stream incl. `{ type: 'events', events: SessionEvent[] }` frames with `text-delta` payloads (`runId`, `seq`) |
| `ThreadRunEventsBridge` | `infra/events/thread-run-events-bridge.ts` | publishes `run.failed/finished/parked/cleared` to `EventBusPort`; **skips** `events` frames (deltas never reach the bus today) |
| `TransportInboundService` | `infra/addons/families/transport/transport.family.ts` | inbound queue → `BridgeInboundPort`, per-(org, addon) drain |
| `AddonTransportRegistry` | same file | registered transports + `ChannelCapabilities` (`canEditMessages`, `maxMessageLength`, `streaming: false`) |
| `AddonCallPort.transportSend/Edit/Typing` | `domain/addons/ports/addon-call.port.ts` | host→addon transport calls with timeout |
| `NeutralBridgeInboundUseCase.recordOutbound` | `application/addons/bridge/neutral-bridge-inbound.use-case.ts` | outbound message-id memory → echo barrier for `isSelfEcho` |
| `CancelRunUseCase` | `application/threads/cancel-run.use-case.ts` | served to addons as `ctx.runs.cancel` (permission `runs.dispatch`) |
| `AddonReasonsToLive` | `infra/addons/wiring/supervisor-hooks/reasons-to-live.ts` | an active transport already keeps the addon process alive |
| `RespondRunUseCase`, `ApprovalStorePort` | `application/threads/respond-run.use-case.ts`, `domain/approval/approval-store.port.ts` | HITL resolution (`getByRunInterrupt`, `decide`, `markRunCancelled`, resumable list) |
| Run event store | `packages/harnesys/src/ports/run-event-store.ts` | persisted frames for replay |

Key fact: deltas already flow through `ThreadEventsPort` (the same frames the WebUI
SSE consumes). The host can project them without any new bus traffic.

## Proposed mechanism: one host-owned session projection

A new `infra/addons/sessions/` capability, `TransportSessionService`, subscribes once
to `ThreadEventsPort`. For every frame it resolves the thread to a transport binding
(new reverse lookup `findByThread(orgId, threadId)` on the binding port); no binding →
no-op. A binding turns the run into a **session**: draft assembly, channel sends,
final message, ask routing, resume — all host-side. The addon keeps doing only what a
transport addon already does: `transport.send` / `transport.edit` / `transport.typing`
handlers, inbound message routing via `ctx.bridge.inbound`, and command parsing.

### Session lifecycle

1. **Created** — on the first delta frame for a thread that has a binding. State row
   `{ orgId, addonId, provider, channel, threadId, runId, draft, lastSeq, messageId }`
   in org SQLite (`addon_transport_sessions`, owned by the sessions adapter, same
   database family as `addon-transport-binding-repository.adapter.ts`).
2. **Streaming** — delta frames append to `draft` (ordered by `seq`, deduplicated with
   the `runId:seq` window pattern from `infra/runtime/org-runtime-publish.ts`). Flushes
   go out on the schedule below.
3. **Terminal** — `run.completed` / `run.cancelled` / `run.failed` frame: final flush
   (full text, or error text), then the row is closed. `run.parked` (HITL interrupt)
   switches the session to the ask-routing state below.
4. **Cancelled** — `run.cancelled` renders "stopped" and closes; `/stop` needs no
   special host state, the addon command handler already calls `ctx.runs.cancel`.

### Draft flush protocol (edit-based, primary)

No new protocol method is required for the common path:

- First flush: `transport.send({ channel, text: draft })` → store `messageId`.
- Subsequent flushes: `transport.edit({ messageId, text: draft })`.
- Terminal: final `transport.edit` (or `transport.send` if edit failed).

This works for any channel whose descriptor declares `capabilities.edit: true`
(Telegram bots). Addons render plain `text`; the host truncates to
`maxMessageLength` and appends no formatting — the addon owns channel rendering.

Optional protocol addition for channels with native live streams (mtproto user
account, where each edit is a visible message revision or where a bot cannot edit):

- Host→addon `transport.stream` (new `hostMethod` in `packages/sdk/src/protocol/map.ts`):
  `{ channel, streamId, seq, text, done }`, notification-grade, declared in
  `TransportDescriptorSchema.capabilities.stream: true`. The addon sends its own
  messages and reports message ids back via a new addon→host `transport.stream.ack`
  (`{ streamId, seq, messageId? }`) so the echo barrier learns them
  (`recordOutbound`). Addons that do not declare the capability never see the method;
  the host falls back to send/edit. This is additive; nothing in core switches on it.

### Coalescing and backpressure (host-side)

- Flush cadence: min 1s per session, plus a size threshold (flush early when the
  draft grew by ≥ 200 chars) — bounded API load, Telegram-friendly.
- Per-channel rate limit in the session service; a `rate_limited`/timeout from
  `transport.edit` multiplies the session's backoff (1s→2s→4s→max 30s) and the next
  flush carries the merged text, so no delta is lost.
- `transport.typing(channel, on)` from first delta until first flush; off at terminal.
- Slow addons do not block the run: flushes are per-session async, one in-flight call
  per session, deltas keep buffering. The `transport` 30s call timeout bounds a stuck
  addon; after N consecutive failures the session is closed with an error notice.

### What the host does vs what the addon implements

| Concern | Owner |
|---|---|
| Delta ordering, dedup, draft assembly, flush scheduling, backoff | host |
| Binding lookup, session rows, resume replay, terminal rendering decision | host |
| Echo barrier (message ids of host-sent drafts) | host, via existing `recordOutbound` |
| Channel rendering, chunking to `maxMessageLength`, keyboards/buttons | addon |
| Command parsing (`/stop`, `/new`, …) and calling `ctx.runs.cancel` / `ctx.bridge.inbound` | addon |
| Inbound delivery into the bridge, pair/claim decisions | `TransportInboundService` + `NeutralBridgeInboundUseCase` (unchanged) |

### Echo suppression

Already solved for host-sent drafts: every `transport.send` result's `messageId` is
fed to `NeutralBridgeInboundUseCase.recordOutbound`, and `isSelfEcho` drops the
mirrored inbound. For `transport.stream`, the addon reports message ids through
`transport.stream.ack` and the host records them the same way. The outbound id memory
(limit 256, per org+addon) moves into the session store so it survives restarts
(presently in-process in `NeutralBridgeInboundUseCase`).

### Resume after restart

On boot the session service loads open sessions (`addon_transport_sessions`), checks
each `runId` against the run event store: terminal frame persisted → close the row
(final edit if the channel still allows it). Otherwise replay frames after `lastSeq`
from the run event store into the draft and continue streaming. If the channel rejects
the edit (Telegram 48h edit window), send a fresh message with the current draft.
Bindings and session rows are org SQLite, so restart safety is the same as bindings.

### HITL ask routing through the same projection

The approval store (`infra/approvals/approval-store.adapter.ts`) already keys
approvals by run interrupt (`getByRunInterrupt`, `markRunCancelled`,
`listResumable`). On a `run.parked` frame the session service:

1. reads the approval via `ApprovalStorePort.getByRunInterrupt(orgId, runId)`,
2. renders the ask through the owning transport: `transport.send` with the question
   text plus structured options,
3. matches the next inbound text on that channel: digits/option label →
   `RespondRunUseCase` (`decide` + resume), free text → forwarded into the thread as
   today. Matching state (`{ approvalId, options, expiresAt }`) is one more column on
   the session row.

Options rendering needs one additive `TransportMessageSchema` field
(`packages/sdk/src/protocol/shared.ts`): `options?: Array<{ id: string; label: string }>`
with an optional `recommendedId`. Telegram addons render inline keyboards; plain
channels render a numbered list. The addon never talks to the approval store — HITL
stays host-owned; the addon only forwards text it already forwards.

Recommended alternative (rejected for now): exposing an `approvals.*` host-service
family to addons. It is gap 1 of migration-from-integrations.md and is still needed
for addons that *raise* approvals; but routing channel asks does not require it.

### Trade-offs vs bus-level `run.delta` + per-addon projection

Alternative: make `ThreadRunEventsBridge` publish `events` frames (`run.delta`) on
`EventBusPort` and let each transport addon subscribe via hooks and project itself.

- Chosen (host projection): one subscriber, one draft buffer per run, one rate
  limiter, one resume path, one echo barrier. Deltas never leave the host process
  (no addon-bus quota/privacy surface, no N×M fan-out). Core owns a genuinely
  cross-cutting concern instead of every addon retyping the legacy connector's
  draft loop. Cost: ~300–400 lines of new infra in `infra/addons/sessions/`, one
  reverse-lookup method on the binding port, and less per-addon freedom.
- Rejected (bus projection): every addon reimplements buffers, dedup, backoff,
  resume, echo memory (the exact code the legacy connector carries by hand today);
  bus traffic multiplies by transport addon count; a buggy addon can spam the
  channel or leak thread content into addon storage. Only wins if addons need
  channel-native streaming semantics the host cannot express — that is exactly what
  the optional `transport.stream` method preserves, so the escape hatch exists
  without committing to fan-out.

### File-level touchpoints

- `packages/sdk/src/protocol/shared.ts` — `TransportMessageSchema.options`,
  `TransportDescriptorSchema.capabilities.stream`, `transport.stream` /
  `transport.stream.ack` schemas.
- `packages/sdk/src/protocol/map.ts` — two new method entries; `runtime.ts` /
  `define-addon.ts` handler registration (mirrors `transport.edit`).
- `packages/sdk/src/addon-context.ts` / `addon-context-factory.ts` — `ctx.transport`-side
  ack helper only if `transport.stream.ack` is addon-initiated (likely yes).
- `apps/server/src/app/domain/addons/ports/transport-binding-repository.port.ts` —
  `findByThread(orgId, threadId): AddonTransportBindingRow[]`.
- `apps/server/src/app/infra/org-sqlite/addon-transport-binding-repository.adapter.ts` —
  reverse lookup; new `addon-transport-session-repository.adapter.ts` for session rows.
- `apps/server/src/app/infra/addons/sessions/` (new) — `transport-session.service.ts`
  (projection, flush scheduler, resume), `transport-session-store.port.ts` (domain port),
  `sessions.module.ts`; wired from `families.module.ts` / `addons-wiring.module.ts` —
  same pattern as `TransportInboundService`.
- `apps/server/src/app/infra/addons/families/transport/transport.family.ts` —
  dispatch `transport.stream` via `AddonCallPort.transportStream`.
- `apps/server/src/app/domain/addons/ports/addon-call.port.ts` — `transportStream`.
- `apps/server/src/app/application/addons/bridge/neutral-bridge-inbound.use-case.ts` —
  outbound-id memory delegated to the session store (behavior unchanged).
- Docs: `docs/addons/runtime-api.md`, `docs/addons/migration-from-integrations.md`
  (gaps 2 and 3 close).

### Implementation plan (mechanical slices)

1. Reverse binding lookup: port method + adapter + spec (pure, testable).
2. Session store port + org-SQLite adapter + spec (in-memory sqlite per repo rules).
3. `TransportSessionService`: subscribe, draft assembly with seq dedup, flush
   scheduler, send/edit via `AddonCallPort`; unit specs with fake clock/bus.
4. Echo memory migration: feed host-sent `messageId`s into the session store;
   `recordOutbound` keeps its signature.
5. Terminal handling + typing + backoff (same slice as 3 if small).
6. Resume: boot replay from the run event store; spec with a fake event store.
7. HITL routing: parked → ask render → inbound match → `RespondRunUseCase`;
   `options` field on `TransportMessageSchema`.
8. Optional `transport.stream` + `transport.stream.ack` protocol entries (only after
   1–7 ship; gated on a real mtproto addon needing them).

Each slice is additive; nothing in legacy (`infra/connector/**`,
`application/connectors/**`) is touched.

## Adjacent gaps (options, one paragraph each)

**Identity linking from addons.** Today `/link <code>` is handled by the legacy
connector calling core `ConfirmIdentityLinkUseCase`. Options: (a) new addon→host
method `identity.confirm({ code, channel, from })` that resolves the account context
from the inbound message and calls the core use-case — portable, but puts a linking
surface in addon hands (needs careful code single-use/expire checks, which the core
use-case already enforces); (b) host-side: the session service treats `/link` like
`/stop` as a reserved channel command executed by the host before dispatch, no addon
API. Recommendation: (b) for parity with `/stop` (one reserved-command list in the
session service), with (a) as the escape hatch for addons that own custom linking UX.

**Multi-node lease for addon workers.** Addon `worker` contributions have no lease; two
host nodes would double-poll. Options: (a) reuse the fleet machine-lease port
(`domain/fleet/`, fencing tokens, TTL) as a generic `AddonWorkerLeasePort` acquired by
the supervisor before autostart workers launch and renewed while they run — fencing
semantics already exist there; (b) a lease table in org SQLite with TTL + heartbeat
from the worker runtime, supervisor-local only — simpler but not fleet-aware and adds
a second lease implementation (violates reuse-over-rebuild). Recommendation: (a),
surfaced through `infra/legacy-ports` or a new thin adapter; workers without the lease
granted simply do not autostart on a non-owning node.

**`$/progress` reachability.** The notification is protocol-declared
(`notificationSpec(..., 'addon')`) and the fake host even collects it, but
`AddonContext` cannot send it and nothing host-side consumes it. Options: (a) expose
`ctx.progress.report({ token, value })` in `addon-context-factory.ts`; the host
dispatcher forwards the notification to the org metrics/UI read-model keyed by the
current call correlation — minimal, matches the existing `$`-namespaced plumbing;
(b) fold progress into `events.emit` with a reserved name — pollutes the addon event
namespace and forces consumers to filter. Recommendation: (a); wire consumption into
the same metrics increment the host dispatcher already records per call, plus an SSE
relay if the WebUI later wants live tool progress.
