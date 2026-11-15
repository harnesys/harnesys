# Contributions

Every capability is a **contribution**: a static declaration in
`addon.json.contributions` plus, for most families, a handler in `defineAddon`. The
family registry is the source of truth for the descriptor shapes
(`packages/sdk/src/families/registry.ts`). Descriptors are validated with the same Zod
schemas the host uses, so an invalid descriptor fails install (`descriptor_schema`).

A contribution is `{ id, family, v?, optional?, descriptor }`. The `id` matches
`^[a-z][a-z0-9-]*$` and is unique within the manifest.

| Family | `defineAddon` key | Host call | Permission |
|---|---|---|---|
| `tool-pack` | `tools` | `tools.call` | — |
| `route` | `routes` | `route.handle` | `routes.public` for public routes |
| `trigger` | `triggers` | `trigger.start` / `trigger.stop` + `ctx.triggers.fire` | `trigger` |
| `job` | `jobs` | `job.run` | — |
| `worker` | `workers` | `worker.start` / `worker.stop` | `worker` |
| `hook` | `hooks` | `hook.deliver` | `events.subscribe` / `accounts.use` |
| `transport` | `transport` | `transport.send/edit/typing` | `bridge.inbound` |
| `source-kind` | `sources` | `source.list/stat/download` (+ optional ops) | `source` |
| `content` | — (package files) | host registers skills/prompts | — |
| `config` | `notifications['config.changed']` | notification | baseline `config.read` |
| `view` | — (data via routes) | host renders sections | — |
| `viewer` | — (editor document via a route) | open a file from the sources tree | — |
| `mcp` | — | registered, listed as a capability | — |
| `lsp` | — | registered, listed as a capability | — |

`mcp` and `lsp` descriptors are accepted and shown in the capability list, but the host
has no consumer that acts on them yet. Do not build behavior on them.

## tool-pack

```json
{
  "id": "pack", "family": "tool-pack",
  "descriptor": {
    "name": "bookmarks",
    "title": "Bookmarks",
    "description": "Save and list bookmarks",
    "skills": ["usage"],
    "tools": [{
      "name": "add",
      "description": "Save a bookmark",
      "inputSchema": {
        "type": "object",
        "properties": { "url": { "type": "string" } },
        "required": ["url"]
      },
      "effect": "write",
      "idempotent": false
    }]
  }
}
```

- The pack is the unit an agent is assigned; the LLM sees each tool as
  `<pack>_<tool>` with non-word characters replaced by `_`.
- `effect`: `read` | `write` | `destructive` (drives host approval policy);
  `idempotent` allows safe retries (`timeoutSec` default 60 cap 600, `maxResultKb`
  default 256).
- `inputSchema`/`outputSchema` is a JSON Schema subset validated by the host before and
  after the call (`invalid_params` / `invalid_response`): `type`, `properties`,
  `required`, `items`, `enum`, `const`, `additionalProperties`, numeric/length/pattern/
  item bounds, `uniqueItems`, bounded `oneOf`/`anyOf`, `description`, `default`, local
  `$defs`/`$ref`. Depth ≤ 8, size ≤ 64 KiB, no external `$ref`.
- `connection` — when set, tools need a bound account (otherwise `account_failed`).
- `specFields` — per-assignment settings (same `FieldSpec` as `config`).
- `skills` — ids of this add-on's `content` skill contributions; the pack embeds them.

## route

```json
{ "id": "items", "family": "route",
  "descriptor": { "id": "items", "method": "GET", "path": "/items", "role": "member" } }
```

```ts
const items: RouteHandler = async (call, ctx) => {
  const rows = await listBookmarks(ctx, { limit: 20 });
  return { status: 200, body: { rows } };
};
```

- Methods: `GET POST PUT PATCH DELETE`. `path` starts with `/` and may use `:param`
  segments; the handler parses params from `call.request.path` itself.
- Org routes mount at `/api/orgs/:orgId/addons/:addonId/r/<path>`; `role` is `member`
  (default) or `admin`.
- `exposure: 'public'` mounts at `/api/addons/public/:orgId/:addonId/r/<path>` without
  org auth and requires the `routes.public` permission; `public + role: 'admin'` is not
  allowed.
- Return `{ status, headers?, body? }`; `bodyLimitKb` limits request size and
  `requestSchema` validates the body.

## trigger

```json
{ "id": "cron", "family": "trigger",
  "descriptor": {
    "kind": "scheduler.cron",
    "title": "Cron schedule",
    "description": "Run an agent on a schedule",
    "configFields": [
      { "key": "cron", "label": "Cron", "type": "text", "required": true }
    ]
  } }
```

```ts
const cron: TriggerPair = {
  start: async (params, ctx) => { /* params.config, params.target, params.instanceId */ },
  stop: async (params, ctx) => { /* paused or removed */ },
};
```

- Global kind is `<addonId>.<descriptor.kind>`. `configFields` is a `FieldSpec[]`.
- `trigger.start` is replayed on every process restart; be idempotent. `trigger.stop`
  carries the reason (pause vs removal).
- Fire with `ctx.triggers.fire({ instanceId, runKey, text?, payload? })`; deduplicated by
  `(instanceId, runKey)`. `limits` (`perDay`, `throttleSec`, `maxBurst`) are enforced by
  the host.

## job

```json
{ "id": "heartbeat", "family": "job",
  "descriptor": { "id": "heartbeat", "title": "Heartbeat",
                  "schedule": { "everySec": 60 }, "catchUp": "none", "defaultEnabled": true } }
```

```ts
const jobs = { heartbeat: async (params, ctx) => { /* ... */ } };
```

- `schedule` is `{ cron }` or `{ everySec }`; `timezone` is `org` (default) or `utc`;
  `catchUp` is `none` or `once`; `timeoutSec` default 900 cap 3600. Overlapping runs are
  skipped (single-flight). No permission is needed.

## worker

```json
{ "id": "poller", "family": "worker",
  "descriptor": { "id": "poller", "title": "Poller", "autostart": true, "restart": "on-failure" } }
```

```ts
const poller: WorkerPair = {
  start: async (_params, ctx) => { while (!ctx.signal.aborted) { /* pollOnce(ctx) */ } },
  stop: async (_params, ctx) => { await ctx.workers.release('poller'); },
};
```

- `autostart` starts the worker with the instance; `restart` is `on-failure` or `never`.
- `ctx.workers.lease/release` gives a durable lease so two hosts do not poll at once.
- Requires the `worker` permission.

## hook

```json
{ "id": "thread", "family": "hook",
  "descriptor": { "id": "thread", "on": { "event": "thread.created" } } }
```

- `on.event` is an org event pattern and needs the `events.subscribe` permission with a
  covering `{ patterns }` scope.
- `on.providerEvent: { connection, types? }` receives provider events for a bound
  account.
- Delivery is at-most-once with a per-add-on queue; call timeout ≤ 10 s. Use triggers or
  jobs when you need stronger guarantees.

## transport

```json
{ "id": "channel", "family": "transport",
  "descriptor": {
    "provider": "example",
    "title": "Example chat",
    "connection": "example",
    "capabilities": { "threads": true, "edit": true, "typing": true, "attachments": false },
    "limits": { "textMax": 4096 }
  } }
```

```ts
const transport: TransportHandlers = {
  send: async ({ message }, ctx) => { /* call the provider; return { messageId } */ },
  edit: async ({ messageId, message }, ctx) => { /* ... */ },
  typing: async ({ channel, on }, ctx) => { /* ... */ },
};
```

Inbound messages go through `ctx.bridge.inbound({ channel, from, text, payload? })`. All
three handlers are optional; derive the capabilities from what you implement.

## source-kind

```json
{ "id": "drive", "family": "source-kind",
  "descriptor": { "id": "drive", "title": "Example drive", "connection": "example" } }
```

```ts
const sources = {
  example: {
    list: async (params, ctx) => ({ entries: [] }),
    stat: async (params, ctx) => ({ entry: { id: params.fileId, name: 'x', kind: 'file' } }),
    download: async (params, ctx) => ({ data: '', eof: true }),
  },
};
```

`list`, `stat`, `download` are required; `upload`, `mkdir`, `remove`, `export` are
optional and the host infers capabilities from what you implement. Bytes travel as base64
chunks. Requires the `source` permission.

## content

```json
{ "id": "usage", "family": "content",
  "descriptor": { "id": "usage", "title": "Bookmark usage", "kind": "skill", "path": "content/usage" } }
```

- `kind` is `skill` or `prompt`; `path` is relative to the package root.
- For a `skill`, `path` is a directory containing `SKILL.md` (and optional `references/`).
  The host registers it as `addon-<addonId>-<skillId>` and copies `SKILL.md` plus its
  supporting files into the org skills directory. At most 32 supporting files, 256 KiB
  each, 1 MiB total.
- Reference a skill from a `tool-pack` with `skills: ["usage"]` — the contribution id.

## config

```json
{ "id": "settings", "family": "config",
  "descriptor": { "fields": [
    { "key": "default_tag", "label": "Default tag", "type": "text", "required": false, "default": "inbox" },
    { "key": "api_note", "label": "API note", "type": "secret", "required": false }
  ] } }
```

Field `type`: `text | secret | textarea | url | select | number | boolean | group`.
Read values at runtime with `ctx.config.get(keys?)`; **secret fields never appear there** —
read them with `ctx.secrets.get(key)`. A `group` field nests `fields`. Options may be
static (`options`) or resolved by the host (`optionsFrom`, e.g. an add-on route). React to
changes with `notifications['config.changed']`.

## view

```json
{ "id": "main", "family": "view",
  "descriptor": { "id": "main", "title": "Overview", "sections": [
    { "type": "status" },
    { "type": "config" },
    { "type": "table", "title": "Bookmarks", "source": { "route": "/items" },
      "columns": [{ "key": "title", "label": "Title", "format": "text" }] }
  ] } }
```

At most one `view` per add-on. Section types: `status`, `capabilities`, `permissions`,
`config`, `connections`, `automations`, `jobs`, `table`, `form`, `actions`, `markdown`,
`frame`. `table.source`, `form.submit`, `actions.route` and `frame.route` reference your
own routes. When no `view` is declared the card renders the default set
(`status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`).

## viewer

```json
{ "id": "editor", "family": "viewer",
  "descriptor": { "id": "editor", "title": "Example diagram", "extensions": [".example"],
                  "route": "/viewer", "mode": "edit", "create": true,
                  "createLabel": "New Example diagram", "icon": "assets/icon.svg" } }
```

Declares file extensions your add-on can open from the sources tree. `route` is a GET
route serving the HTML document; one extension has one owner (a second claim gets
`viewer_extension_conflict`). `create: true` adds a "create file" entry to the sources
tree menus: `createLabel` is its full label rendered verbatim (omit it and the host
falls back to `New <title>`), and the new file gets the first extension from
`extensions`. `icon` (a lucide name or an `assets/*.svg` path) is shown for those
extensions in the sources tree and in the create entries.

Next: [Build and package](build-and-package.md).
