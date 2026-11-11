# Runtime API

## defineAddon

```ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';

const addon = defineAddon({
  tools, routes, triggers, jobs, workers, hooks, transport, lifecycle, notifications,
});
```

| Group | Signature |
|---|---|
| `tools` | `Record<string, (input: Record<string, unknown>, ctx) => unknown>` |
| `routes` | `Record<string, (request: { method, path, query, headers, body? }, ctx) => { status, headers?, body? }>` |
| `triggers` | `Record<string, { start(params: { instanceId, kind, config, target? }, ctx), stop(params: { instanceId }, ctx) }>` |
| `jobs` | `Record<string, (params: { jobId }, ctx) => void>` |
| `workers` | `Record<string, { start(params: { workerId }, ctx), stop(params: { workerId }, ctx) }>` |
| `hooks` | `Record<string, (params: { hookId, event }, ctx) => void>` |
| `transport` | `{ send?, edit?, typing? }` |
| `lifecycle` | `{ upgrade?({ fromVersion }, ctx) }` |
| `notifications` | `{ 'config.changed'?, 'permissions.changed'?, 'accounts.changed'? }` |

`defineAddon` derives the declared handler list sent in the `initialize` handshake.
The host rejects calls to undeclared handlers.

Entry point:

```ts
if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: 'acme.greeter', version: '1.0.0' } });
}
```

## Protocol

NDJSON JSON-RPC 2.0 over stdio. Message cap 8 MiB. Every host→addon request carries
`_meta: { correlationId, deadline, principal: { type: 'agent'|'user'|'system' }, agentId?,
threadId?, runId?, locale }`. The runtime enforces the deadline: a handler that runs past
it gets aborted (`ctx.signal`) and fails with `AddonError('cancelled' | 'timeout')`.
`$/cancel` aborts a specific request. Addons must check `ctx.signal` in long loops.

## AddonContext

A fresh context is built per call. Fields:

- `ctx.meta` — call metadata (see above); use `locale` for L10n output, `threadId`/`runId`
  for attribution.
- `ctx.signal` — AbortSignal, cancelled on deadline or `$/cancel`.
- `ctx.log.debug/info/warn/error(message, fields?)` — writes to the addon log (visible on
  the detail page, SSE stream `/logs/stream`). Baseline permission.
- `ctx.config.get(keys?: string[])` — config values for this org (defaults merged over
  stored). Baseline permission `config.read`.
- `ctx.secrets.get(key)` — secret values set through the config UI (`type: 'secret'`);
  returns `null` when unset. Baseline `secrets.own`. Read-only: there is no write API.
- `ctx.db` — per-org SQLite (`exec`, `all`, `get`, `run`, `batch` ≤ 100 statements).
  Baseline `db`. Params are `string | number | boolean | null`. Every query is
  SQL-guarded (no PRAGMA, no ATTACH, quota rules) and capped at 8 MiB results / 5s.
- `ctx.events.emit(name, payload)` — emit an addon event; names are forced under the
  `<addonId>.` prefix, payload ≤ 64 KiB. Baseline `events.emit.own`.
- `ctx.http.fetch({ url, method?, headers?, body?, auth? })` — outbound HTTP. Returns
  `{ status, headers, body, bodyBase64? }`. Requires `http.fetch` scoped to the host
  (egress policy; violations fail with `permission_denied`). `auth` injects stored
  connection credentials host-side: `{ connection, accountId?, scheme: 'bearer' | 'basic' | 'header', credentialKey?, header? }` — the add-on never sees raw credentials.
- `ctx.accounts.list(connection)` — bound accounts (label, externalAccountId, status);
  `ctx.accounts.report(connection, code, accountId?)` — report account errors
  (`account_failed` etc.); `ctx.accounts.access(connection, accountId?)` — raw
  credentials + `expiresAt` (permission `accounts.credentials`, audited).
- `ctx.runs.dispatch({ threadId?, agentId?, input })` → `{ runId }` — start an agent run
  (permission `runs.dispatch`).
- `ctx.runs.cancel({ threadId, runId })` → `{ ok: true }` — cancel a running or pending
  run (permission `runs.dispatch`). Unknown thread/run → `not_found`.
- `ctx.threads.create({ title?, agentId })` → `{ threadId }` (permission `threads.create`).
- `ctx.triggers.fire({ instanceId, runKey, text?, payload? })` →
  `{ outcome: 'fired' | 'suppressed' | 'busy' | 'failed' }` — fire an automation run from
  a trigger instance (permission `trigger`); `runKey` deduplicates.
- `ctx.bridge.inbound({ channel, from?, text, payload? })` — inject an inbound message
  into the core bridge (permission `bridge.inbound`).
- `ctx.workers.report(workerId, state, code?)` — worker state (permission `worker`).

Not available: clock (use `ctx.meta.deadline` + `ctx.signal`), metrics (host-side
read-model), secrets/config writes, HITL approvals, progress notifications.

## Error model

```ts
throw new AddonError('rate_limited', { retryable: true, detail: '...' });
```

Reasons: `invalid_params`, `invalid_response`, `permission_denied`, `not_found`,
`conflict`, `quota_exceeded`, `rate_limited`, `timeout`, `cancelled`, `unavailable`,
`unsupported`, `account_failed`, `incompatible_handlers`, `migration_failed`,
`permission_revoked`, `internal`. `accountCode` marks account-scoped failures
(e.g. `needs_setup` results in tools). JSON-RPC error codes are mapped by the host:
`invalid_params` → -32602, `unsupported`/`not_found` → -32601, else -32000.

## Lifecycle

- `initialize` — implicit handshake: the add-on reports id, version, platform, handler
  list. Mismatch → the instance fails to start (identity/handlers errors).
- `lifecycle.upgrade { fromVersion }` — after migrations ran on update; implement schema
  or state conversions here.
- Notifications: `config.changed { keys }` (re-fetch with `config.get`), `permissions.changed`,
  `accounts.changed { connection, accountId, status }`.
- `shutdown` — auto-ACK; the host kills the process afterwards.

## Process model

- `lazy` activation: started on first call, idles out (~5 min) when unused.
- `resident` activation: kept alive; needs `lifecycle.resident`.
- Crash policy: restart with backoff 1s→60s (±25% jitter); 5 crashes in 10 min →
  `quarantined` (cleared via `POST :id/quarantine/reset`).
- Ping monitor: 15s interval, 5s timeout, 3 misses → restart. RSS limit enforced.
