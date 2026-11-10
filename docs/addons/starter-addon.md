# Starter add-on: author walkthrough

`add-ons/harnesys.starter` is the reference implementation of the add-on platform. It exercises every family the backend supports today — config (with a secret), tool-pack, job, trigger, route (`:params`), hook — and deliberately omits the `view` family so the default add-on page (status, permissions, config, connections, automations, jobs) is rendered from the manifest alone. Copy it when writing a new add-on.

## Package layout (§4.1)

```
add-ons/harnesys.starter/
  addon.json          manifest (validated by validateManifest from @harnesys/sdk)
  package.json        build + typecheck scripts, workspace link to @harnesys/sdk
  tsconfig.json       extends the root tsconfig
  src/index.ts        the whole add-on: defineAddon(...) + process bootstrap
  migrations/0001_init.sql  add-on data schema (items, heartbeat, hook_log, bookkeeping)
  dist/index.js       built bundle (single self-contained file, committed output of `bun run build`)
```

The builtin install source (`BuiltinAddonSourceAdapter`, `apps/server/src/app/infra/addons/catalog/addon-staging.ts`) reads `add-ons/<source>/` and expects `addon.json` at the package root. The directory is staged as-is, so keep `node_modules/` and `src/` out of production concerns: the runtime entry must be the bundled `dist/index.js` with no runtime dependencies beyond what is bundled.

## Manifest decisions

- `runtime.profile: 'trusted'` — trust is assigned by the source (`builtin`), not the manifest. `trusted` avoids the OS sandbox dependency that `restricted` requires (`resolveLaunchPlan` in `apps/server/src/app/infra/addons/sandbox/launch-policy.ts`); a builtin add-on that declared `restricted` would refuse to start where no sandbox mechanism exists.
- `permissions` — only non-baseline rights are declared: `http.fetch` scoped to `api.github.com`, `events.subscribe` scoped to the `thread.created` pattern, and `trigger` (required by the `triggers.fire` host method, checked by the dispatcher). Baseline rights (`db`, `config.read`, `secrets.own`, `log`, `events.emit.own`) are implicit.
- `connections` — one optional `github` requirement (`accountKinds: ['github-installation']`, `cardinality: 'one'`). `optional: true` demonstrates bindings without blocking enable: the add-on runs unbound and the `github_user` tool degrades to a `needs_setup` result.
- `data: { migrations: 'migrations', quotaMb: 16 }` — own SQLite at `orgDataDir/<org>/addons/harnesys.starter/data.db`, migrated forward with `user_version` bookkeeping.

## defineAddon and handlers (§14.1)

Handlers are keyed by contribution identifiers from `addon.json`:

| Manifest contribution | defineAddon key | Method |
| --- | --- | --- |
| `tool-pack` tools `ping`, `github_user` | `tools['ping']`, `tools['github_user']` | `tools.call` (`tool` = descriptor tool name) |
| routes `items-list`, `items-create`, `item-get` | `routes['items-list']`, ... | `route.handle` (`routeId` = descriptor id) |
| trigger `tick` (kind `starter.tick`) | `triggers['starter.tick']` | `trigger.start` / `trigger.stop` (keyed by descriptor `kind`) |
| job `heartbeat` | `jobs['heartbeat']` | `job.run` (`jobId` = descriptor id) |
| hook `thread-created` | `hooks['thread-created']` | `hook.deliver` (`hookId` = descriptor id) |
| — | `notifications['config.changed']` | host notification |

`defineAddon` derives the `handlers` list sent in the `initialize` result; the host rejects instances that declare handlers their manifest does not require, and vice versa.

The entry exports `addon` (named export) and calls `startAddonProcess` only under `import.meta.main`. The host in-process loader (`SdkInProcessAddonLoader`) imports `dist/index.js` and drives the runtime itself; the guard prevents a second stdio loop from starting at import time. Running `bun dist/index.js` executes as a real process with the same code path.

## What each piece proves

- **Config + secret roundtrip**: `ping` writes to the add-on db and log; `github_user` reads `default_github_login` from `config.get` and checks `secrets.get('api_note')`. Secrets are set with `PUT /orgs/:orgId/addons/:id/config { secrets: { api_note: '...' } }` and never appear in the REST config read model.
- **Auth-injected HTTP**: `github_user` calls `ctx.http.fetch` with `auth: { connection: 'github', scheme: 'bearer' }`. The host injects `Authorization` from the bound account without the token ever entering the add-on process. With no binding the host throws `account_failed` and the tool returns `{ status: 'needs_setup' }`.
- **Job scheduling**: `heartbeat` runs every 60 s (`catchUp: 'none'`) and inserts into `heartbeat(at)`; state lives in `addon_job_state` (`last_status`, `next_run_at`). It can also be run on demand with `POST .../jobs/heartbeat/run`.
- **Trigger lifecycle**: the `starter.tick` kind receives `trigger.start` with the instance config, fires once via `ctx.triggers.fire` with `runKey = <instanceId>:<start timestamp>`, and deduplicates replays (§8.7): the run key is persisted in `trigger_starts` and recorded in `trigger_fired`, so a repeated `trigger.start` is suppressed instead of double-firing.
- **Routes**: `GET /items`, `POST /items` (validated by the route `requestSchema`), and `GET /items/:id` under `/orgs/:orgId/addons/harnesys.starter/r/*` with member role. The `:id` path parameter is parsed from `request.path` (the protocol carries the raw subpath).
- **Hook delivery**: the `thread-created` hook subscribes to the host event `thread.created`; creating any thread in the org delivers `{ name, version, occurredAt, payload }` and the handler writes a `hook_log` row.
- **Default page**: no `view` contribution — the UI builds the page from the manifest.

## Build and install

```
cd add-ons/harnesys.starter
bun install          # links @harnesys/sdk from packages/sdk
bun run build        # bun build --target=bun src/index.ts --outfile dist/index.js
bun run typecheck
```

Install on a host (plan → confirm, nothing executes until confirm):

```
POST /api/addons/packages/plan            {"source": "harnesys.starter"}
POST /api/addons/packages/plan/<planId>/confirm
```

Enable for an organization with explicit grants (baseline rights are implicit):

```
POST /orgs/:orgId/addons/harnesys.starter/enable
{"grants": [
  {"id": "http.fetch", "scope": {"hosts": ["api.github.com"]}},
  {"id": "events.subscribe", "scope": {"patterns": ["thread.created"]}},
  {"id": "trigger"}
]}
```

The full curl walkthrough lives in `docs/addons/acceptance-starter.md`.
