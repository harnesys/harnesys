# Contributions

Contributions are declared in `addon.json` under `contributions`:

```json
{ "id": "pack", "family": "tool-pack", "descriptor": { "...": "..." } }
```

- `id`: `^[a-z][a-z0-9-]*$`, unique per manifest (`duplicate_contribution_id`).
- `family`: one of the 13 registered families (unknown family is an error unless the
  contribution is `optional`, then a warning).
- `v`: optional descriptor schema version (all families are currently v1).
- Each descriptor is validated by the family's Zod schema and cross-checked against the
  manifest (`crossCheck`): e.g. a tool-pack referencing `connection` or `skills` must
  declare them.

Handler keys passed to `defineAddon` map to contribution ids. Families and their
handlers:

| Family | defineAddon key | Called by host as |
|---|---|---|
| `tool-pack` | `tools` | `tools.call` |
| `route` | `routes` | `route.handle` |
| `trigger` | `triggers` | `trigger.start` / `trigger.stop` |
| `job` | `jobs` | `job.run` |
| `worker` | `workers` | `worker.start` / `worker.stop` |
| `hook` | `hooks` | `hook.deliver` |
| `transport` | `transport` | `transport.send` / `transport.edit` / `transport.typing` |
| `content` | — (host-side) | registered as org skills |
| `config` | — (host-side) | config UI + `config.changed` notification |
| `view` | — (host-side) | detail page sections |
| `source-kind` | `sources` | `source.list` / `stat` / `download` / `upload` / `mkdir` / `remove` / `export` |
| `mcp` | — | **stub, not consumed** |
| `lsp` | — | **stub, not consumed** |

## tool-pack

Registers agent tools. Pack id becomes `<addonId>.<name>`.

The agent-facing tool name is `<addonId>.<tool name>` with every character outside
`[a-zA-Z0-9_-]` replaced by `_`, because LLM providers reject dots in function names:
add-on `harnesys.google-calendar`, tool `create_event` → `harnesys_google-calendar_create_event`.
The add-on call still uses the original descriptor `name`.

```json
{
  "id": "pack", "family": "tool-pack",
  "descriptor": {
    "name": "github",
    "title": "GitHub tools",
    "description": "Read GitHub data",
    "connection": "github",
    "tools": [{
      "name": "user",
      "description": "Fetch a user profile",
      "inputSchema": { "type": "object", "properties": { "login": { "type": "string" } }, "required": ["login"] },
      "effect": "read",
      "timeoutSec": 30,
      "maxResultKb": 64
    }]
  }
}
```

- Tool `inputSchema` is a JSON-Schema subset (depth ≤ 8, ≤ 64 KiB, local `$ref` only);
  the host validates tool input against it.
- `effect: 'read' | 'write' | 'destructive'`; `idempotent` marks safe retries.
- `timeoutSec` default 60s, cap 600s; `maxResultKb` default 256.
- `skills` references `content` contributions of kind `skill` shown with the pack.
- `specFields` (FieldSpec[]) collects org-wide parameters at setup.

## trigger

Declares a trigger kind for automations. Global kind is `<addonId>.<kind>`.

```json
{
  "id": "tick", "family": "trigger",
  "descriptor": {
    "kind": "starter.tick",
    "title": "Starter tick",
    "description": "Fires on a schedule defined by the instance",
    "configFields": [{ "key": "label", "label": "Label", "type": "text", "required": true }],
    "limits": { "perDay": 100, "throttleSec": 5, "maxBurst": 3 }
  }
}
```

- `configFields`: FieldSpec[] shown when creating an instance.
- `limits`: `perDay`, `throttleSec`, `maxBurst` (per 1s) enforced host-side on fire.
- Requires the `trigger` permission. Firing calls `ctx.triggers.fire({ instanceId,
  runKey, ... })`; `runKey` deduplicates.

## job

Scheduled work, cron or interval.

```json
{
  "id": "heartbeat", "family": "job",
  "descriptor": {
    "id": "heartbeat",
    "title": "Heartbeat",
    "schedule": { "everySec": 60 },
    "timezone": "utc",
    "catchUp": "none",
    "defaultEnabled": true
  }
}
```

- `schedule`: `{ cron }` (croner syntax, UTC or org timezone) or `{ everySec }`.
- `catchUp: 'once'` runs one missed tick after downtime; `'none'` skips.
- Timeout: `timeoutSec` capped at 3600s (default 900s). Org admins toggle jobs on the
  detail page and can run them on demand (`Run now`).

## worker

Long-lived in-process routine.

```json
{
  "id": "poller", "family": "worker",
  "descriptor": { "id": "poller", "title": "Updates poller", "autostart": true, "restart": "on-failure" }
}
```

- Report state via `ctx.workers.report(workerId, 'running' | 'stopped' | 'failed', code?)`.
- `restart: 'on-failure'` auto-restarts 5s after a failed report. Requires `worker`.

## route

HTTP endpoints mounted under the org API.

```json
{
  "id": "items-create", "family": "route",
  "descriptor": {
    "id": "items-create", "method": "POST", "path": "/items",
    "role": "member", "exposure": "org", "bodyLimitKb": 64,
    "requestSchema": { "type": "object", "required": ["text"] }
  }
}
```

- Org routes: `/api/orgs/:orgId/addons/:addonId/r/<route-path>` (auth by org session;
  `role: 'member' | 'admin'`) — the manifest path, not the contribution id, is appended:
  a route declared with `path: "/items"` is served at `.../r/items` and `.../r/items/:id`.
- Public routes (`exposure: 'public'`) are served at
  `/api/addons/public/:orgId/:addonId/r/<route-path>` without org auth; they require the
  `routes.public` permission (high risk) and are rate-limited (20 req/s, burst 40).
  `exposure: 'public'` + `role: 'admin'` is rejected.
- Path may contain `:param` segments; the handler receives the raw `request.path` and
  parses params itself.
- `requestSchema` (JSON-Schema subset) is carried with the route for body validation.

## transport

Declares the add-on as a messaging transport (chat channel).

```json
{
  "id": "channel", "family": "transport",
  "descriptor": {
    "provider": "acme-chat",
    "title": "Acme Chat",
    "connection": "chat-account",
    "capabilities": { "threads": true, "edit": true, "typing": true, "attachments": false, "topics": true, "reactions": false, "readReceipts": false },
    "limits": { "textMax": 4096 }
  }
}
```

- Handlers: `send({ message: { channel, text, format?, replyTo?, topic?, attachments? } })`
  → `{ messageId? }`; `edit`; `typing({ channel, on })`.
- Inbound messages enter the core bridge via `ctx.bridge.inbound({ channel, from?, text, payload? })`.
- Channels are currently non-streaming (`capabilities.streaming` is always false).

## hook

Reacts to host events or provider events.

```json
{ "id": "thread-created", "family": "hook", "descriptor": { "id": "thread-created", "on": { "event": "thread.created" } } }
```

- `on: { event }` — host event bus pattern (e.g. `thread.created`, `run.finished`,
  `run.failed`, `run.parked`, `run.started`, `run.cleared`); requires `events.subscribe`
  with a matching `patterns` scope.
- `on: { providerEvent: { connection, types? } }` — provider webhook events routed to the
  connection's accounts.
- Delivery is queued (256, drop-oldest) and bounded to 10s; the host ensures the process
  is running before `hook.deliver`.

## content

Ships skills or prompts as real org skills.

```json
{ "id": "howto", "family": "content", "descriptor": { "id": "howto", "title": "How to use", "kind": "skill", "path": "content/howto" } }
```

- `path` is resolved against the package root; a skill is a directory with `SKILL.md`.
- `kind: 'skill' | 'prompt'`.

## config

Declares configuration fields shown on the detail page.

```json
{
  "id": "settings", "family": "config",
  "descriptor": { "fields": [
    { "key": "default_github_login", "label": "Default GitHub login", "type": "text", "required": true },
    { "key": "api_note", "label": "API note", "type": "secret", "help": "Stored in the host secret store" }
  ] }
}
```

FieldSpec `type`: `text | secret | textarea | url | select | number | boolean`.
Read values with `ctx.config.get(keys)`; secrets with `ctx.secrets.get(key)` only.

## view

Customizes the addon detail page. One view per addon (`duplicate_view`).

```json
{ "id": "main", "family": "view", "descriptor": { "id": "main", "title": "Overview", "sections": ["status", "permissions", "config", "connections", "automations", "jobs"] } }
```

Sections: `status`, `permissions`, `config`, `connections`, `automations`, `jobs`,
`table` (source route + columns), `form`, `actions`, `markdown`, `frame`.
Default set: status, permissions, config, connections, automations, jobs.

## source-kind

A knowledge-source backend: the add-on serves a remote cloud folder and the core source
pipeline (mirror engine, sync-back, conflict handling) drives it.

```json
{
  "id": "google-drive", "family": "source-kind",
  "descriptor": { "id": "google-drive", "title": "Google Drive folder", "connection": "google" }
}
```

- Handlers (`defineAddon` key `sources`, keyed by the descriptor id — one add-on may declare
  several kinds):

  | Op | Protocol method | Required |
  |---|---|---|
  | `list` | `source.list` | yes |
  | `stat` | `source.stat` | yes |
  | `download` | `source.download` | yes |
  | `upload` | `source.upload` | no |
  | `mkdir` | `source.mkdir` | no |
  | `remove` | `source.remove` | no |
  | `export` | `source.export` | no |

- Capabilities are not declared twice: the host derives them from the handlers the add-on
  reports in `initialize`. An add-on that does not implement `upload`/`mkdir`/`remove` is a
  read-only source and sync-back is skipped for it.
- The full seven methods require the `source` permission.
- Bytes move in base64 chunks (`offset`/`length`, 4 MiB per call in the host bridge), so file
  size is not bounded by the 8 MiB message cap. Return `eof: true` on the last chunk.
- Entries returned by `list`/`stat` carry `{ id, name, kind: 'file' | 'folder', size?, modifiedAt?, mimeType? }`;
  `mimeType` is what the host uses to decide about exporting vendor-native documents.
- The add-on owns vendor auth: it calls the vendor through `ctx.http.fetch` with
  `auth: { connection, accountId, scheme: 'bearer', credentialKey }`. The core never sees the
  token, and the mirror runs on the host that runs the add-on.
- Attach/browse/refresh for org members:
  `GET /api/orgs/:orgId/addons/:addonId/source-kinds`,
  `POST .../source-kinds/:sourceKindId/browse`,
  `POST .../source-kinds/:sourceKindId/attach`,
  `GET .../sources`, `POST .../sources/:sourceId/refresh`.

## mcp / lsp

Accepted and registered, but stubs — descriptors are `{ id, title, connection? }` and
nothing consumes them yet. Do not build integration behavior on them.
