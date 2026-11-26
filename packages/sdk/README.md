# @harnesys/sdk

Leaf package for addon authors. Implements the addon platform spec (`docs/ADDONS_PLAN.md`): manifest, contributions, protocol, permissions, `defineAddon`, the host client, and the testing fake host. The package imports nothing from the core (`harnesys`, `@harnesys/contracts`, `apps/server`) — this is gate §16.3.

## Install

```sh
bun add @harnesys/sdk
```

Version `1.0.0` tracks the addon platform contract (`platform: 1`); `1.1.0` adds tool schema validation to the fake host; `1.2.0` adds `createLabel` and `icon` to the viewer descriptor. The SDK ships TypeScript sources for Bun and compiled ESM plus declarations in `dist/`; see [Распространение SDK](../../docs/add-ons/sdk.md#распространение-sdk) for the export modes and the consumer `tsconfig` shape.

## Layout

```
src/
  manifest/        AddonManifest, Contribution, ConnectionRequirement, L10n, JSON Schema publication, validator
  protocol/        JSON-RPC envelope, CallMeta, errors, handshake, method map + derived types, golden fixtures
  families/        descriptor schemas for all 13 families + FieldSpec + JSON-Schema subset (§6.5)
  permissions/     PermissionRequest, baseline and known permission ids, EffectivePermission
  addon-context.ts       AddonContext interface (typed host client surface for handlers)
  addon-context-factory.ts  createAddonContext over a HostChannel
  host-client.ts   HostChannel + createHostClient (validates results via protocol schemas)
  define-addon.ts  defineAddon() + handlers derivation
  runtime.ts       in-process runtime: dispatch host→addon calls, deadlines, cancellation
  process-entry.ts NDJSON stdio framing (8 MiB cap, UTF-8), initialize handshake, $/cancel
  testing/         createFakeHost, in-memory db with authorizer, fixtures
```

## Usage

```ts
import { defineAddon } from '@harnesys/sdk';

export const addon = defineAddon({
  tools: { 'github.list_repos': async (input, ctx) => ctx.http.fetch({ url: 'https://api.github.com/user/repos', auth: { connection: 'github', scheme: 'bearer' } }) },
  triggers: { 'telegram.feed': { start: async (params, ctx) => {}, stop: async (params, ctx) => {} } },
});
```

`defineAddon` is a **named export** (the repo lint forbids default exports); addons use `import { defineAddon } from '@harnesys/sdk'` instead of the plan's `export default` example.

Entry point for a process addon:

```ts
import { startAddonProcess } from '@harnesys/sdk';

await startAddonProcess({ definition: addon, addon: { id: 'harnesys.demo', version: '1.0.0' } });
```

Testing without the host:

```ts
import { createFakeHost } from '@harnesys/sdk/testing';

const host = createFakeHost({ definition: addon, manifest, config, accounts, http });
await host.callTool('github', 'github.list_repos', {});
```

## Protocol method map

Single source in `src/protocol/map.ts`. Every entry: `{ direction, params, result, permission }` on Zod; client/dispatcher/handler types are derived from the map (`HostServiceClient`, `AddonDispatcher`, `AddonHandlerOf`) — a mismatch is a compile error.

- host→addon: `initialize`, `shutdown`, `ping`, `lifecycle.upgrade`, `tools.call`, `route.handle`, `trigger.start`, `trigger.stop`, `trigger.action`, `job.run`, `worker.start`, `worker.stop`, `transport.send`, `transport.edit`, `transport.typing`, `hook.deliver`
- host→addon notifications: `initialized`, `config.changed`, `permissions.changed`, `accounts.changed`
- addon→host: `config.get`, `secrets.get`, `db.exec/all/get/run/batch`, `log.write`, `events.emit`, `http.fetch`, `accounts.list/report/access`, `runs.list/dispatch/cancel`, `threads.create/get/patch/compact`, `agents.list`, `skills.list`, `usage.summary`, `org.settings.get`, `approvals.request`, `files.stat/read/write`, `triggers.fire/get/create/update`, `bridge.inbound`, `workers.report`
- notifications (both/addon): `$/cancel` (both), `$/progress` (addon)

Permissions: `null` = baseline; otherwise one of `http.fetch`, `accounts.use`,
`accounts.credentials`, `events.subscribe`, `runs.dispatch`, `runs.read`, `threads.create`,
`threads.read`, `threads.write`, `threads.compact`, `agents.read`, `skills.read`,
`usage.read`, `files.read`, `files.write`, `bindings.write`, `approvals.request`,
`routes.public`, `lifecycle.resident`, `source`, `bridge.inbound`, `trigger`, `worker`
(the last two are contribution-derived, see §6.4 "через вклад").

## Families

Trigger instances are host-owned: `trigger.start` receives `config` (declared
`configFields`), the validated `target` (`threadId`, `agentId`, `modeId?`, `workspace?`)
and the operator `instructions` that the host appends to every fired run. `target.workspace`
is the thread's working directory: the host binds it to the target thread, so fired runs and
manual messages in that thread execute there. Only chat threads accept it; issue and group
threads reject it. `instructions` may be an empty string. Fire with
`ctx.triggers.fire({ instanceId, runKey, text?, title?, fields?, payload? })`; `text` is
the event body, `instructions` live on the instance and are edited in the trigger
settings. One instance per thread is enforced by the core.

`target.scripts` (pre/post shell commands with an optional gate) is part of the target: an
add-on sets it through `ctx.triggers.create/update` and reads it with `ctx.triggers.get`. An
update that omits `scripts` keeps the stored ones. Non-empty scripts need
`acknowledged: true`; the core `automations` pack sets it automatically. The host
validates and executes them. `standard.scripts` can relabel or disable the dialog block. See
`docs/external-addons/trigger-scripts.md`.

Instance operations are `descriptor.actions` plus `triggers[kind].action(params, ctx)`.
`params` is `{ instanceId, kind, action, input? }`; the host routes it as `trigger.action` and
the core `automations` pack exposes it as `automation_action`, validating `input` against the
action's `inputSchema`. This is the single agent surface for status, test, deliveries, secret
rotation and similar operations.

`tool-pack`, `trigger`, `job`, `worker`, `route`, `transport`, `hook`, `content`, `config`, `view`, `source-kind`, `mcp`, `lsp` — each with a descriptor interface, Zod schema and schema version (`*_SCHEMA_VERSION = 1`). Tool/route input schemas use the JSON-Schema subset of §6.5 (`src/families/json-schema.ts`): depth ≤ 8, size ≤ 64 KiB, local `$ref` only.

## Deviations from the plan

- `defineAddon` is a named export (repo lint forbids default exports).
- `triggers.fire` / `workers.report` use contribution-derived permission ids `trigger` / `worker` — the plan gates them "through a contribution", the map needs a concrete id string.
- `mcp` / `lsp` / `source-kind` descriptors are minimal v1 stubs (the plan does not define their shapes yet).
- `AddonErrorData` carries `accountCode?: string` for `account_failed` (plan: AccountErrorCode in `data`).
- `zod` v4 `z.toJSONSchema` is used for JSON-Schema publication (§4.3).
