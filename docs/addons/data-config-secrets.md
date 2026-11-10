# Data, config, and secrets

## Database

Each addon gets a SQLite database **per organization** at
`<orgDataDir>/addons/<addonId>/data.db` (WAL, foreign keys on). Access only via
`ctx.db` — the host SQL-guards every statement (no PRAGMA, no ATTACH, statement
timeout 5s, result cap 8 MiB, batch ≤ 100 statements) and enforces the manifest quota.

```ts
await ctx.db.exec('create table if not exists notes (id text primary key, text text)');
const row = await ctx.db.get('select text from notes where id = ?', [id]);
const res = await ctx.db.run('insert into notes (id, text) values (?, ?)', [id, text]);
// res: { changes, lastInsertRowid }
```

Quota (`data.quotaMb` in the manifest): when exceeded, only size-reducing statements
(`DELETE`, `DROP`, `VACUUM`) are allowed; everything else fails with `quota_exceeded`.

## Migrations

`data.migrations` points to a directory of `NNNN_name.sql` files:

```
migrations/
  0001_init.sql
  0002_add_column.sql
```

- Applied in order on **enable** and on **update**; tracked by `PRAGMA user_version`.
- Each migration runs in a transaction with a `VACUUM INTO` backup (last 3 kept);
  failure restores the previous state and fails the enable/update with
  `migration_failed`.
- A database with a newer schema than the package version is rejected (409 downgrade).
- After migrations on update, the addon receives `lifecycle.upgrade { fromVersion }` —
  do JS-side state conversions there.

For quick per-process schema setup, memoized `ctx.db.exec(SCHEMA_SQL)` is fine
(see the starter's `ensureSchema`); migrations are for durable evolution.

## Config

Config contribution declares fields (see contributions.md). Values are per org:

- Read at runtime: `ctx.config.get()` (all) or `ctx.config.get(['key'])`.
- The host merges declared defaults over stored values.
- Field `type: 'secret'` values never appear in `config.get` — they go to the secret
  store; read them with `ctx.secrets.get(key)`.
- Updates via `PUT /api/orgs/:orgId/addons/:addonId/config` (values + optional
  `secrets` map; `null` deletes a secret). Running instances receive
  `config.changed { keys }` — re-fetch on notification.

## Secrets

- Namespace: `addon:<orgId>:<addonId>:<key>`; the addon can only read its own keys
  (baseline permission `secrets.own`).
- Write path is the config UI (secret fields) or the config REST endpoint. There is no
  runtime write API — secrets are credentials installed by the org admin.
- Never log secret values; the starter pattern returns only
  `secretConfigured: secret !== null`.

## Events emitted by the addon

`ctx.events.emit('something-happened', payload)` publishes
`<addonId>.something-happened` on the org event bus:

- visible on the org SSE stream (`/api/orgs/:orgId/addons/events` filters `addon.*`),
- subscribable by other addons' hooks (`events.subscribe` with patterns).

Host events an addon can subscribe to (hooks): `thread.created`, `run.started`,
`run.finished`, `run.failed`, `run.parked`, `run.cleared` (see contributions.md → hook).
