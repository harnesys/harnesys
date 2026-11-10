# Migrating integrations to add-ons

This document maps what the existing integrations (Telegram connector, Google, GitHub)
do today onto add-on platform primitives, and lists what is **not yet portable** so it
can be built or consciously deferred before migrating.

## What the integrations do today

| Integration | Capabilities | Host facilities used |
|---|---|---|
| Telegram connector | bot account (token secret), pairing, chat discovery, chat→thread bindings, long-poll trigger (leased worker), inbound decision engine (pair/claim/HITL/stop/identity-link/commands), outbound run-output streaming (drafts, echo barriers), agent tools pack, identity linking | secret store, background worker + machine lease, org SQLite, thread-events subscription, HITL use-cases, identity-link repo, in-process event bus |
| Google | org OAuth client config, callback + loopback OAuth flows, token refresh, Gmail/Calendar/Sheets/Docs/YouTube/Search Console tools pack, Drive as knowledge-source backend | secret store (`cloud:google-client` + per-account tokens), org SQLite, public callback route, outbound HTTPS, runtime pack ports |
| GitHub | GitHub App (manifest auto-create or manual), installation accounts with minted tokens, webhook trigger (HMAC, push/issues/PR/workflow_run stored), issues/PR/CI/code tools pack, git credentials | public webhook route, secret store (PEM/webhook secret), org SQLite, outbound HTTPS, runtime pack ports |
| Apps provider platform | already provider-generic: declarative app/account kinds, connect flows, verify/refresh/revoke, webhook → events + effects, scoped secrets, egress allow-lists | public hook/OAuth/launch routes, org SQLite, connect sessions |

The Apps provider platform stays: it is the account layer. Add-ons consume accounts
through connections (see accounts-and-connections.md); they do not replace OAuth flows.

## Capability mapping: integration behavior → add-on primitives

| Integration capability | Add-on primitive | Fits |
|---|---|---|
| Agent tools pack (google/github/telegram capabilities) | `tool-pack` contribution; `ctx.http.fetch` with `auth.connection` injects stored tokens server-side | yes |
| Per-account token refresh | host-side: connection auth resolves/refreshes credentials before `http.fetch`; no addon code | yes |
| Webhook trigger (GitHub push/issues/PR) | `route` contribution with `exposure: 'public'` (+ `routes.public` permission); HMAC verification in the route handler; dedup via `ctx.db` | yes |
| Long-poll receiver (Telegram getUpdates) | `worker` contribution (`autostart`, `restart: 'on-failure'`); offset/state in `ctx.db` | yes, minus fencing (see gaps) |
| Scheduled jobs | `job` contribution (cron / `everySec`, catch-up, host-side limits) | yes |
| Inbound messages into the bridge | `ctx.bridge.inbound({ channel, from, text })` | yes |
| Outbound chat messages (send/edit/typing) | `transport` contribution (`send`/`edit`/`typing`) | yes, non-streaming only |
| Inbound decisioning (pair/claim/commands) | route/hook/worker handlers + `ctx.db` state | yes, except HITL and identity link (see gaps) |
| Run dispatch from a message | `ctx.runs.dispatch({ threadId, input })` / `ctx.threads.create` | yes |
| Reaction to lifecycle events | `hook` contributions on `thread.created`, `run.started/finished/failed/parked/cleared` | yes |
| Per-integration state | `ctx.db` (own SQLite per org, migrations, quota) | yes |
| Scoped credentials | config `secret` fields → `ctx.secrets.get`; connection tokens → `http.fetch auth` | yes |
| Setup/config UI | `config` contribution (FieldSpec) + `view` contribution | yes |
| Skills/prompts shipped with the integration | `content` contribution (`skill`/`prompt`) | yes |
| Trigger instances created by admins | `trigger` contribution + automation catalog (instances, limits, dedup by `runKey`) | yes |
| Storing vendor webhook deliveries | `ctx.db` tables + `hook` `providerEvent` for app-account events | yes |
| Detail page per integration | addon detail page with view sections (status/permissions/config/connections/automations/jobs/table) | yes |

## Not yet portable (gaps)

1. **HITL approvals.** The approval store and interrupt machinery are legacy-owned
   (`infra/approvals/`, core `domain/approval/`). Addons have no API to raise, list, or
   resolve approvals; the Telegram connector's `/ask` flow cannot move as-is.
   → Needs an approval port for addons (or keeping HITL in core).
2. **Cancel a running run.** The connector's `/stop` command cancels runs. Addons have
   `runs.dispatch` but no cancel/interrupt API.
   → Needs `runs.cancel` (or an event-driven stop contract) on the host service map.
3. **Streaming run output back to a channel.** The connector streams run deltas to
   Telegram (draft buffers, echo barriers, resume after restart). Addons get only
   discrete events (`run.finished` etc.) and a non-streaming transport
   (`capabilities.streaming` is always false). A chat addon can send final replies, not
   live-typed ones.
   → Needs run-delta events on the bus (subscribable via `events.subscribe`) and/or a
     streaming transport capability.
4. **Identity linking** (`/link <code>` in Telegram). `ConfirmIdentityLinkUseCase` is
   core; addons have no surface to confirm identity links.
   → Needs a host-service method or keeping the flow in core.
5. **Knowledge-source backends (Google Drive).** Materialization/sync-back lives in the
   separate `source` subsystem; the `source-kind` contribution family is a registry stub.
   → Needs the `source-kind` family to gain real semantics, or Drive stays a source
     driver.
6. **Multi-node lease fencing.** The Telegram poller fences with machine leases
   (15s TTL). Addon workers have no lease primitive; running two host nodes would double
   poll. Acceptable for single-node hosts.
7. **`$/progress`** is protocol-declared but unreachable from `AddonContext` — long
   operations cannot report incremental progress to the UI.
8. **`mcp` / `lsp` families** are stubs — MCP server or LSP integrations cannot be
   expressed yet.
9. **External install sources** (URL/registry) are disabled until signature
   verification exists; distribution is monorepo builtins + manual home-catalog
   placement (or path install).

## Recommended migration order

1. **Google + GitHub tool packs** — pure `tool-pack` + `http.fetch` + connections; no
   gaps hit. Their account layer stays in the Apps platform.
2. **GitHub webhook trigger** — public route + `ctx.db` dedup; drops the legacy
   `integration_events` table usage.
3. **Telegram chat transport** — `transport` + `bridge.inbound` + trigger instances for
   message notifications. Requires gaps 2–4 to be resolved (or consciously dropped)
   before removing the legacy connector: HITL, `/stop`, streaming, identity link, and
   lease fencing are all connector-only behaviors today.
4. Leave the Apps provider layer untouched — it is the account/connect substrate for
   every addon connection.

Per AGENTS.md, legacy (`integrations`, `connectors`, `sources` paths) is never deleted
or rewritten by the agent; new addons run in parallel until the user decides otherwise.
