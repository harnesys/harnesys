# Contributions

A contribution is a static entry in `addon.json.contributions`:

```json
{ "id": "pack", "family": "tool-pack", "v": 1, "optional": false, "descriptor": { } }
```

The `family` names the core extension point (authoritative list: `packages/sdk/src/families/registry.ts`). The host registers the descriptor as data; your handler code is only called when the contribution is used. Full, real descriptors live in `add-ons/*/addon.json` and are explained in `docs/add-ons/contributions.md`.

| Family | `defineAddon` key | Host call | Permission | Full example |
|---|---|---|---|---|
| `tool-pack` | `tools` (by tool name) | `tools.call` | — | `harnesys.webhook`, `harnesys.telegram-tools` |
| `trigger` | `triggers` (by descriptor `kind`) | `trigger.start/stop` + `ctx.triggers.fire` | `trigger` | `harnesys.webhook` (`webhook.http`) |
| `job` | `jobs` (by descriptor `id`) | `job.run` | — | `harnesys.scheduler` (`tick`) |
| `worker` | `workers` (by descriptor `id`) | `worker.start/stop` + `ctx.workers.*` | `worker` (for `ctx.workers.*`) | `harnesys.github` (`repo-poller`) |
| `route` | `routes` (by contribution `id`) | `route.handle` | `routes.public` for `exposure: public` | `harnesys.webhook` |
| `transport` | `transport` | `transport.send/edit/typing` + `ctx.bridge.inbound` | `bridge.inbound` | `harnesys.telegram-bot` |
| `hook` | `hooks` (by descriptor `id`) | `hook.deliver` | `events.subscribe` (events) / `accounts.use` (provider events) | `harnesys.github` |
| `content` | — (package files) | host registers org skills | — | — |
| `config` | — (`notifications['config.changed']`) | notification on change | `config.read` (baseline) | `harnesys.telegram-tools` |
| `view` | — (data via `route`) | renders sections | — | `harnesys.webhook` |
| `viewer` | — (editor doc via `route`) | open file from sources tree | — | `harnesys.drawio` |
| `source-kind` | `sources` (by descriptor `id`) | `source.*` | `source` | `harnesys.google-drive` |
| `mcp`, `lsp` | — | **stubs**: descriptors accepted, no consumer | — | — |

Rule: a contribution without a handler fails the handshake (`incompatible_handlers`); a handler without a contribution is dead code the host never calls. Key mismatches by family are listed below.

## tool-pack

```json
{ "id": "pack", "family": "tool-pack", "descriptor": {
  "name": "example", "title": "Example tools", "description": "Read Example data",
  "connection": "example",
  "tools": [{ "name": "get_user", "description": "Read a profile",
    "inputSchema": { "type": "object", "properties": { "login": { "type": "string" } }, "required": ["login"] },
    "effect": "read", "idempotent": true }] } }
```

- Global pack name `<addonId>.<name>`, agent-facing tool name `<pack>_<tool>` with unsafe chars replaced by `_` (the add-on id stays out of it). The tool namespace is flat and shared with the core packs, so a colliding pack name is rejected at activation.
- Host validates `inputSchema` before the call and `outputSchema` (if given) after; both are the JSON Schema subset validated by `validateInputSchema`.
- `effect: read | write | destructive` drives host approval policy; the add-on cannot lower it. `idempotent` lets the host retry safely. `timeoutSec` (default 60, cap 600), `maxResultKb` (default 256).
- `connection` requires a binding; without it tool calls return `account_failed` / show `needsSetup`.
- `specFields` are per-assignment settings; `skills` reference `content` contribution ids in the same add-on.
- Key in `defineAddon.tools` is the **tool name**, not the pack name.

## trigger

```json
{ "id": "cron", "family": "trigger", "descriptor": {
  "kind": "scheduler.cron", "title": "Cron schedule", "description": "Run an agent on a cron schedule",
  "configFields": [{ "key": "cron", "label": "Cron", "type": "text", "required": true, "widget": { "kind": "cron" } }],
  "limits": { "perDay": 100, "throttleSec": 5, "maxBurst": 3 },
  "standard": { "instructions": { "label": "Message to the agent" } } } }
```

- Global kind `<addonId>.<kind>`; key in `defineAddon.triggers` is the **`kind`**.
- `configFields` are `FieldSpec[]`; the user creates instances. `connection` links a binding; `standard` relabels/disables the host's standard form blocks (`name`, `agent`, `target`, `mode`, `instructions`).
- `trigger.start` gets `config`, `instructions` (operator text the host appends to every fired run) and the host-owned `target` `{ threadId, agentId, modeId?, workspace? }`; `workspace` is applied to the target thread's workspace binding, so runs and manual messages in that thread execute there. Do not persist or rewrite them, read them.
- One instance per thread is enforced by the core; the trigger settings dialog edits thread, mode and workspace.
- Fire events with `ctx.triggers.fire({ instanceId, runKey, text?, title?, fields?, payload? })`; the host dedups by `(instanceId, runKey)` over 7 days and enforces `perDay`/`throttleSec`/`maxBurst`. `text` is the event body, `fields` are labelled chips.
- `trigger.start` runs at instance enable and again on every process start (replay): make it idempotent (upsert).

## job

```json
{ "id": "heartbeat", "family": "job", "descriptor": {
  "id": "heartbeat", "title": "Heartbeat", "schedule": { "everySec": 60 },
  "timezone": "org", "catchUp": "once", "defaultEnabled": true, "timeoutSec": 300 } }
```

- `schedule` is `{ "cron": "*/5 * * * *" }` (croner) or `{ "everySec": 60 }`; `timezone: "org" | "utc"`; `catchUp: "once" | "none"`; `timeoutSec` default 900, cap 3600.
- The host owns the schedule (no permission, no timer in your code). Key in `defineAddon.jobs` is the descriptor `id`. Single-flight: overlapping runs are skipped.

## worker

```json
{ "id": "poller", "family": "worker", "descriptor": {
  "id": "poller", "title": "Updates poller", "autostart": true, "restart": "on-failure" } }
```

- `autostart` starts the worker on every instance start (after replay); `restart: "on-failure"` restarts 5s after `ctx.workers.report(id, 'failed')`.
- Use `ctx.workers.lease/release` so two nodes never poll the same stream; loop on `!ctx.signal.aborted`; `release` in `worker.stop`.
- Key in `defineAddon.workers` is the descriptor `id`.

## route

```json
{ "id": "items-create", "family": "route", "descriptor": {
  "id": "items-create", "method": "POST", "path": "/items", "role": "member",
  "exposure": "org", "bodyLimitKb": 64, "requestSchema": { "type": "object", "required": ["text"] } } }
```

- Org routes: `/api/orgs/:orgId/addons/:addonId/r/<path>` (`role: member | admin`). The **descriptor `path`** is what appears in the URL, not the contribution id.
- Public routes (`exposure: "public"`) require `routes.public` and are served at `/api/addons/public/:orgId/:addonId/r/<path>`; `public + role: admin` is rejected. Rate limit 20/s (burst 40).
- `:param` segments are parsed by your handler from the raw request. Handler returns `{ status, headers?, body? }`; a string body is sent as-is (used by viewers).
- Key in `defineAddon.routes` is the **contribution id**. The same routes back `view` tables/forms/actions and `optionsFrom.addonRoute`.

## transport

```json
{ "id": "channel", "family": "transport", "descriptor": {
  "provider": "example", "title": "Example chat", "connection": "example",
  "capabilities": { "threads": true, "edit": true, "typing": true, "attachments": true },
  "limits": { "textMax": 4096 } } }
```

- Implements `send` / `edit` / `typing` in `defineAddon.transport`; inbound messages go through `ctx.bridge.inbound`. The core bridge owns chat↔thread binding, echo policy, and streaming projection. Needs `bridge.inbound`. Full guide: `docs/add-ons/transport.md`.

## hook

```json
{ "id": "thread-created", "family": "hook", "descriptor": { "id": "thread-created", "on": { "event": "thread.created" } } }
```

- `on.event` subscribes to the org bus (`thread.created`, `run.finished`, `addon.*`); scope the grant `events.subscribe` with `{ "patterns": ["..."] }` covering the event.
- `on.providerEvent: { connection, types? }` receives provider webhook deliveries for bound accounts (needs `accounts.use`).
- Delivery is at-most-once (queue 256, drop-oldest, ≤10s). Build reliability on triggers/jobs, not hooks. Key in `defineAddon.hooks` is the descriptor `id`.

## config

```json
{ "id": "settings", "family": "config", "descriptor": { "fields": [
  { "key": "default_repo", "label": "Default repo", "type": "text", "required": true },
  { "key": "api_note", "label": "API note", "type": "secret", "help": "Stored in the host vault" } ] } }
```

- `type`: `text | secret | textarea | url | select | number | boolean | group`. Read with `ctx.config.get`; `secret` fields never appear there — use `ctx.secrets.get(key)`.
- Fields support `default`, `options`, `multi`, `visibleWhen`, `optionsFrom` (`addonRoute` | `connections` | `agents`), `pattern`, `widget`, `advanced`. Full `FieldSpec`: `docs/add-ons/ui.md#fieldspec`.
- React to edits in `defineAddon.notifications['config.changed']` and reload values there.

## view

```json
{ "id": "main", "family": "view", "descriptor": { "id": "main", "title": "Overview", "sections": [
  { "type": "status" }, { "type": "capabilities" }, { "type": "permissions" },
  { "type": "connections", "connections": ["example"] }, { "type": "config" },
  { "type": "automations", "triggers": ["example.kind"] }, { "type": "jobs" },
  { "type": "table", "title": "Rows", "source": { "route": "/items" },
    "columns": [{ "key": "name", "label": "Name", "format": "text" }] } ] } }
```

- At most one `view` per add-on. Closed set of 12 section types: `status`, `capabilities`, `permissions`, `config`, `connections`, `automations`, `jobs`, `table`, `form`, `actions`, `markdown`, `frame`. The frontend orders them.
- Without a `view`, the card uses the default set (`status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`).
- `table`/`form`/`actions` call the add-on's own routes. `frame` is an isolated iframe (no `allow-same-origin`) talking only over the `postMessage` bridge.
- A `notes.md` at the package root or in `assets/` is appended as a markdown section automatically; no contribution needed.

## viewer

```json
{ "id": "drawio", "family": "viewer", "descriptor": {
  "id": "drawio", "title": "Diagram", "extensions": [".drawio"], "route": "/viewer", "mode": "edit",
  "create": true, "createLabel": "New Draw.io", "icon": "assets/icon.svg" } }
```

- Claims dot-prefixed, lowercase file extensions and a GET `route` serving the editor HTML. One extension has one owner; a second claim fails the handshake (`viewer_extension_conflict`).
- `create: true` adds a "create file" entry to the sources tree menus. `createLabel` is its full label, rendered verbatim (`L10n`; without it the host falls back to `New <title>`); the created file gets the first entry of `extensions`.
- `icon` (lucide name or `assets/*.svg`) is rendered for the claimed extensions in the sources tree and in the create entries.
- The host exposes the table at `GET /api/orgs/:orgId/addon-viewers`. Reference: `harnesys.drawio`.

## source-kind

```json
{ "id": "example-drive", "family": "source-kind", "descriptor": {
  "id": "example-drive", "title": "Example folder", "connection": "example" } }
```

- Implements `source.list/stat/download` (required handlers) plus `upload/mkdir/remove/export` (optional; capabilities derive from which you declare). Key in `defineAddon.sources` is the descriptor `id`.
- Bytes move as base64 chunks (4 MiB per call). Needs `source`. Reference: `harnesys.google-drive`.

## mcp / lsp

Descriptors are accepted and registered; there is no consumer yet. Do not build integration behavior on them.
