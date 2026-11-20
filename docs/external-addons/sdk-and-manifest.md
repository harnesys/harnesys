# SDK and manifest

`addon.json` is the whole static description of your add-on: who it is, what it
contributes, what it asks for, how to run it. The host validates it with the SDK's Zod
schemas both at install and at enable. Anything not in the manifest, your add-on cannot
do — contributions are registered as data, without running your code.

## `addon.json`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` (`<publisher>.<name>`); must equal the package directory name |
| `version` | string | yes | strict semver `^\d+\.\d+\.\d+$` (no pre-release suffix) |
| `platform` | int | yes | protocol major; currently `1`; an unknown value is refused, not degraded |
| `title` | L10n | yes | shown in the catalog and on the card |
| `description` | L10n | yes | |
| `icon` | string | no | a Lucide icon name (`bookmark`) or an SVG in the package (`assets/icon.svg`) |
| `color` | string | no | brand color, `#RRGGBB` |
| `homepage` | string | no | |
| `license` | string | no | |
| `runtime` | object | yes | `{ entry: string; profile: 'trusted' \| 'restricted' }` |
| `activation` | enum | yes | `lazy` or `resident`; `resident` needs the `lifecycle.resident` permission |
| `permissions` | PermissionRequest[] | yes | gated permissions only; see below |
| `connections` | ConnectionRequirement[] | yes | external account bindings (may be `[]`) |
| `data` | object | no | `{ migrations: string; quotaMb?: number }`; `migrations` is a directory path in the package |
| `features` | string[] | no | hard host requirements beyond `platform`, e.g. `family:source-kind@1` |
| `contributions` | Contribution[] | yes | the declared capabilities |

### `runtime`

```json
"runtime": { "entry": "dist/index.js", "profile": "trusted" }
```

`entry` is a path from the package root; it must exist in the package (build it with
`bun run build`). `profile` selects the execution mechanics:

- `trusted` — a clean-environment process, or in-process for `builtin`/`local` packages.
  The boundary is fault isolation, not security. This is the right choice for packages a
  human installs onto their own host.
- `restricted` — an OS sandbox (`sandbox-exec`/seatbelt on macOS, `bwrap` on Linux):
  the package directory is read-only, writes go to the add-on data directory and tmp,
  and the network is closed. A `restricted` package cannot start on a host that has no
  sandbox mechanism unless the host policy sets `allowUnsandboxedExternal`.

Trust is assigned by the install source, not by the manifest. Packages delivered over a
URL or a registry (`external` trust) may only be `restricted`, and that source is
disabled today (see [Install on a host](install-on-a-host.md)).

### `activation`

- `lazy` (typical) — the process starts on the first call that needs it and goes idle
  after about five minutes without a reason to live.
- `resident` — the host keeps the process alive; requires the `lifecycle.resident`
  permission. Use it for pollers and schedulers.

### L10n

```ts
type L10n = string | Record<string, string>; // 'Bookmarks' or { en: 'Bookmarks', ru: 'Закладки' }
```

Resolution is requested locale → `en` → first entry. Strings may contain `%key%`
placeholders; every key must exist in `l10n/en.json` of the package or validation fails
with `missing_l10n_key`.

### Permissions

Baseline permissions are always granted and are **not** declared in the manifest:
`config.read`, `log`, `db`, `secrets.own`, `events.emit.own`, `org.read`. Everything else
is gated and must be declared:

```json
{ "id": "http.fetch", "scope": { "hosts": ["api.example.com"] }, "reason": "Call the example API" }
```

- `reason` is required and shown in the consent dialog.
- `optional: true` means the org may decline it; without the grant those calls return
  `permission_denied`, so degrade gracefully.
- `scope` narrows the grant (`http.fetch` → `{ hosts }`, `events.subscribe` →
  `{ patterns }`, `accounts.use` → `{ connections }`). A call outside scope is denied.

The gated catalog: `http.fetch`, `accounts.use`, `accounts.credentials`, `runs.dispatch`,
`runs.read`, `threads.create`, `threads.compact`, `threads.read`, `threads.write`,
`agents.read`, `bindings.write`, `usage.read`, `skills.read`, `events.subscribe`,
`files.read`, `files.write`, `bridge.inbound`, `routes.public`, `lifecycle.resident`,
`trigger`, `worker`, `source`, `approvals.request`. `trigger`, `worker` and `source` are
declared like any other, but they only matter together with the matching contribution.

### Connections

```json
{
  "id": "example",
  "label": "Example account",
  "accountKinds": ["example-account"],
  "scopes": ["read"],
  "cardinality": "one",
  "optional": true
}
```

`accountKinds` needs at least one entry; `cardinality: 'one'` rejects a second binding;
descriptors that reference a connection via `connection:` must point at a declared one or
validation fails with `unknown_connection`. Until an account is bound, tools that need the
connection return `account_failed` and the card shows `needsSetup`.

## `defineAddon`

```ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';

export const addon = defineAddon({
  tools: { add, list },          // key = tool name from the tool-pack descriptor
  routes: { items },             // key = route contribution id
  notifications: {
    'config.changed': async (params, ctx) => { /* params.keys */ },
  },
});

if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: 'acme.example', version: '1.0.0' } });
}
```

Handler keys are matched to contributions exactly:

| `defineAddon` key | Manifest contribution | Host call | Permission |
|---|---|---|---|
| `tools` (tool name) | `tool-pack` | `tools.call` | — |
| `routes` (contribution id) | `route` | `route.handle` | `routes.public` for `exposure: 'public'` |
| `triggers` (`descriptor.kind`) | `trigger` | `trigger.start` / `trigger.stop` | `trigger` |
| `jobs` (`descriptor.id`) | `job` | `job.run` | — |
| `workers` (`descriptor.id`) | `worker` | `worker.start` / `worker.stop` | `worker` |
| `hooks` (`descriptor.id`) | `hook` | `hook.deliver` | `events.subscribe` / `accounts.use` |
| `transport` | `transport` | `transport.send/edit/typing` | `bridge.inbound` |
| `sources` (source-kind id) | `source-kind` | `source.*` | `source` |
| `lifecycle.upgrade` | — | `lifecycle.upgrade` | — |
| `notifications` | — | `config.changed` etc. | baseline |

`defineAddon` computes `handlers` (the methods declared in the handshake): always `ping`
and `shutdown`, then `tools.call`, `route.handle`, `trigger.start`/`trigger.stop`,
`job.run`, `worker.start`/`worker.stop`, `hook.deliver`, the transport methods you
defined, the source methods you implemented, and `lifecycle.upgrade`. An undeclared
handler is dead code; the host never calls it. A declaration without a handler fails the
handshake with `incompatible_handlers`.

`if (import.meta.main)` around `startAddonProcess` is mandatory: in in-process mode the
host imports your bundle and runs the runtime itself; the guard prevents a second stdio
loop.

### Call identity

Every host call carries `ctx.meta`: `{ correlationId, principal, agentId?, threadId?,
runId?, orgId?, locale }`. On `tools.call` made from an agent session the meta identifies
the caller: `principal: { type: 'agent', id }` plus `agentId` and `threadId` — a
tool-pack can enforce per-agent behavior (grants, quotas) by reading `ctx.meta.agentId`.
`route.handle` from an authenticated org request carries `principal: { type: 'user', id }`
and no `agentId`; anything outside a session (jobs, triggers, hooks) is
`principal: { type: 'system' }`. Never trust the meta as an authorization proof for
admin-grade operations — pair it with your own grant tables if you need scoping.

## Idempotency and lifecycle

The host restarts your process freely, so handlers must tolerate repeats:

1. `trigger.start` and `worker.start` are replayed after every process start — upsert,
   never blind-insert.
2. `ctx.triggers.fire({ instanceId, runKey, ... })` is deduplicated by `(instanceId,
   runKey)`; make `runKey` deterministic from the source event id.
3. Handle `config.changed` by re-reading the values instead of caching them for the
   lifetime of the process.
4. `lifecycle.upgrade({ fromVersion }, ctx)` runs after the SQL migrations are applied to
   the data database; make it idempotent.

## Data and SQL

`ctx.db` is the add-on's own SQLite data database (created from `migrations/*.sql`; the
fake host starts empty). Signatures and types come from the SDK:

```ts
import type { DbRow, DbStatement, DbWriteResult, SqlParam } from '@harnesys/sdk';

interface AddonDb {
  exec(sql: string): Promise<void>;
  all(sql: string, params?: SqlParam[]): Promise<DbRow[]>;
  get(sql: string, params?: SqlParam[]): Promise<DbRow | null>;
  run(sql: string, params?: SqlParam[]): Promise<DbWriteResult>; // { changes, lastInsertRowid }
  batch(statements: DbStatement[]): Promise<DbWriteResult[]>; // one transaction
}

type SqlParam = string | number | boolean | null;
type DbRow = Record<string, unknown>;
interface DbStatement { sql: string; params?: SqlParam[] }
```

Host-side facts worth knowing: statements are cached per SQL text; every statement has a
5 s timeout; `batch` accepts at most 100 statements; a query result larger than 8 MiB
fails with `quota_exceeded` (413).

### Names

- Contribution **ids** (also the `routes`/`jobs`/`workers`/`hooks` handler keys) must
  match `^[a-z][a-z0-9-]*$`.
- `tool-pack` descriptor names and tool names accept any non-empty string, but the
  agent-facing tool name is `<pack>_<tool>` with every character outside
  `[a-zA-Z0-9_]` collapsed to `_`. Pick tool names from `[a-zA-Z0-9_]` so two tools
  cannot collapse to the same exposed name (`a.b` and `a_b` would). The name is global to
  the model call — the core packs share the namespace — so a pack whose names collide with
  another add-on's pack is rejected at activation (`tool_name_taken`); keep the pack name
  distinctive.
- `defineAddon` tool keys must equal the descriptor tool names exactly, otherwise the
  handshake fails with `incompatible_handlers`.

### `data.quotaMb`

Quota counts the add-on's SQLite data database (`page_count × page_size`), not the
package. There is **no host default** — an unset `quotaMb` means no quota. Estimate from
average row bytes × expected rows × growth horizon, plus indexes, and keep 2–3×
headroom. When the quota is exceeded only size-reducing statements (`DELETE`, `DROP`,
`VACUUM`) are accepted until the database shrinks back under the limit; reads keep
working.

### What the SQL authorizer allows

Every statement runs through the host's SQL guard (the fake host mirrors it with
`guardSql`):

- **Denied outright**, anywhere in the statement: `ATTACH`, `DETACH`,
  `load_extension(…)` → `permission_denied`.
- **PRAGMA**: read-only and whitelisted — only `PRAGMA user_version` and
  `PRAGMA foreign_keys` are allowed; any other PRAGMA, or any `PRAGMA … = value` write,
  is denied.
- Everything else is regular SQLite: JSON functions such as `json_each` / `json_extract`
  are **allowed** — the guard restricts statements, not functions.

## Errors

```ts
import { AddonError } from '@harnesys/sdk';

throw new AddonError('not_found', { detail: 'bookmark 42 does not exist' });
```

`AddonError(reason, { retryable?, detail?, accountCode? })`. The reasons are
`invalid_params`, `invalid_response`, `permission_denied`, `not_found`, `conflict`,
`quota_exceeded`, `rate_limited`, `timeout`, `cancelled`, `unavailable`, `unsupported`,
`account_failed`, `incompatible_handlers`, `migration_failed`, `permission_revoked`,
`internal`. Only `AddonErrorData` crosses the process boundary; an arbitrary exception
becomes `internal`. `detail` is part of the contract — the host surfaces it in the REST
response. Use `isAddonError(error)` to detect one, because your bundle carries its own
copy of the SDK and `instanceof` does not hold across copies.

## Runtime limits and imports

- **Import only `@harnesys/sdk`** (plus `@harnesys/sdk/testing` in tests). Nothing else
  is resolvable on a host.
- **No `console`.** Log through `ctx.log.debug/info/warn/error`; those lines land in the
  card's log panel.
- **No polling timers.** The process is started on demand and stopped when idle; a
  `setInterval` that hits the network "just in case" fights the supervisor. Use a `job` for
  periodic work, a `worker` for a long-lived loop (with `ctx.workers.lease`), or a
  `trigger` for event-driven work.
- Keep secrets out of `ctx.config` and logs; use the `secret` field type and `ctx.secrets`.
- Message size cap is 8 MiB per protocol message; tool calls get a per-call deadline
  (`timeoutSec`, default 60, cap 600) and a result cap (`maxResultKb`, default 256).

The available `ctx.*` services: `config`, `secrets`, `db`, `log`, `events`, `http`,
`files`, `accounts`, `bindings`, `runs`, `threads`, `agents`, `usage`, `skills`,
`triggers`, `bridge`, `workers`, `org`, `approvals`, `progress`, plus `meta` and `signal`.

Next: [Contributions](contributions.md).
