# Code contract

The bundle exports a named `addon` (result of `defineAddon`) and, under `import.meta.main`, starts the stdio loop. Everything else is host behavior you must satisfy.

## Entry point

```ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';

const ADDON_ID = 'acme.greeter';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: { greet: (input, ctx) => ({ text: `Hello, ${String(input.name)}!` }) },
  routes: { greeting: () => ({ status: 200, body: { text: 'Hello, world!' } }) },
  triggers: { 'acme.kind': { start: async (params, ctx) => {}, stop: async (params, ctx) => {} } },
  jobs: { heartbeat: async (params, ctx) => {} },
  workers: { poller: { start: async (params, ctx) => {}, stop: async (params, ctx) => {} } },
  hooks: { 'on-thread': async (params, ctx) => {} },
  transport: { send: async (params, ctx) => ({ messageId: '1' }) }, // edit/typing optional
  sources: { 'acme-source': { list, stat, download } }, // list/stat/download required; see contributions.md for shapes
  lifecycle: { upgrade: async (params, ctx) => {} },
  notifications: {
    'config.changed': async (params, ctx) => {},
    'permissions.changed': async (params, ctx) => {},
    'accounts.changed': async (params, ctx) => {},
  },
});

if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: ADDON_ID, version: ADDON_VERSION } });
}
```

`defineAddon` returns `ResolvedAddonDefinition` — your maps plus `handlers`, the method list derived from the maps (`ping`, `shutdown`, and one per non-empty family). `startAddonProcess` runs the runtime over stdio; the host also imports the bundle for in-process mode, which is why `import.meta.main` is required — without it the import opens a second loop. `ADDON_ID`/`ADDON_VERSION` are constants you copy from `addon.json`.

## Handler keys must match contributions

| `defineAddon` map | Key | Matches manifest |
|---|---|---|
| `tools` | tool name | a `tool-pack` tool `name` |
| `routes` | contribution `id` | a `route` contribution `id` |
| `triggers` | descriptor `kind` | a `trigger` descriptor `kind` |
| `jobs` | descriptor `id` | a `job` descriptor `id` |
| `workers` | descriptor `id` | a `worker` descriptor `id` |
| `hooks` | descriptor `id` | a `hook` descriptor `id` |
| `sources` | descriptor `id` | a `source-kind` descriptor `id` |

A declared contribution with no handler fails instance startup at the handshake (`incompatible_handlers`). A handler with no contribution is dead code the host never calls. Handler signatures are typed by the SDK (`ToolHandler`, `RouteHandler`, `TriggerPair`, `JobHandler`, `WorkerPair`, `HookHandler`, `TransportHandlers`, `SourceBackendHandlers`, `LifecycleHandlers`, `NotificationHandlers` in `packages/sdk/src/define-addon.ts`).

## Idempotency (required)

- `trigger.start`/`trigger.stop` and `worker.start`/`worker.stop` are replayed on every process start (recovery). Upsert — never blind `insert`; never re-issue a secret that already exists. `trigger.start` carries the instance `config`, the host-owned `target` (`{ threadId, agentId, modeId?, workspace? }`, where `workspace` is the target thread's working directory) and `instructions`; read them instead of storing copies.
- `ctx.triggers.fire` dedups by `(instanceId, runKey)` for 7 days: make `runKey` deterministic when the source event has an id (`${instanceId}:${event.id}`).
- `lifecycle.upgrade` runs after the SQL migrations are already applied — make it idempotent.
- `notifications['config.changed']` reloads values; do not cache config across calls in module scope (a long-lived instance can hold a stale snapshot).
- The reconciler stops "disabled but alive" instances and clears old fires; do not build your own scheduler to duplicate it.

## Errors

Throw `AddonError`; the host maps the reason to a JSON-RPC code and to the client. Never leak raw exception text across the boundary.

```ts
import { AddonError } from '@harnesys/sdk';

if (!Number.isInteger(input.count)) {
  throw new AddonError('invalid_params', { detail: 'count must be an integer' });
}
```

| Reason | When |
|---|---|
| `invalid_params` | input is not acceptable (contribution schema validation catches most first) |
| `not_found` | the entity does not exist |
| `conflict` | state blocks the action (double binding, duplicate) |
| `rate_limited` | you are protecting a provider; set `{ retryable: true }` |
| `account_failed` | the account is broken; add `{ accountCode }` |
| `unavailable` | transient; set `{ retryable: true }` |
| `internal` | everything else |

Errors from `ctx.*` calls arrive as `AddonError` too — branch on `error.reason` (e.g. `not_found` for a stale watermark, `account_failed` for a revoked token). Log `error.detail`, not an arbitrary exception `message`. A tool result failing the host `outputSchema` is `invalid_response`.

## Runtime discipline

- Log through `ctx.log.*`; `console` is banned. Never log secret values.
- No timers/polling loops that call HTTP "just in case". Long work checks `ctx.signal.aborted` and respects `ctx.meta.deadline`.
- Prefer `ctx.http.fetch` auth injection over `ctx.accounts.access`; the token then never enters your process.
- Keep handlers small and single-purpose; put access to data in one module (raw SQL with parameters, mapping in one place), as `harnesys.webhook/src/store.ts` does.

## Style (enforced by biome)

- Files `kebab-case`; no default exports; named `export const addon`.
- Object shapes: `interface`. `type` only for unions/aliases/function types.
- No `any`, no non-null assertion `!`, no `console`, no `enum` (use unions).
- Files target ~300 lines; 350 is the hard limit. Split by role (`index.ts`, `trigger.ts`, `tools.ts`, `store.ts`, `routes.ts`).
- Prefer `import type` for type-only imports — **except** any class used as a DI token in the server codebase (not relevant to add-ons, which have no DI container).
- Keep the package layered like its neighbours: entry point wires, feature files hold logic, one store module owns SQL.
