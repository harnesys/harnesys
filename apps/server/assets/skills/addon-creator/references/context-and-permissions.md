# Context and permissions

`ctx` (`AddonContext`, `packages/sdk/src/addon-context.ts`) is the only way add-on code reaches the outside world. Every method is a validated host call with a permission check, rate limit, and audit. A fresh context is built per call.

## ctx services

| Service | Key methods | Permission |
|---|---|---|
| `ctx.meta` | `correlationId`, `deadline`, `principal`, `agentId?`, `threadId?`, `runId?`, `orgId?`, `locale` | — |
| `ctx.signal` | `AbortSignal` (deadline or `$/cancel`) | — |
| `ctx.log` | `debug`/`info`/`warn`/`error` | `log` (baseline) |
| `ctx.db` | `exec`, `all`, `get`, `run`, `batch` | `db` (baseline) |
| `ctx.config` | `get(keys?)` | `config.read` (baseline) |
| `ctx.secrets` | `get`, `set`, `delete` (namespace `addon:<org>:<addonId>:`) | `secrets.own` (baseline) |
| `ctx.events` | `emit(name, payload)` — name must start with `<addonId>.` | `events.emit.own` (baseline) |
| `ctx.org` | `settings()` → `{ timezone }` | `org.read` (baseline) |
| `ctx.progress` | `progress(token, value)` | — |
| `ctx.http` | `fetch({ url, method?, headers?, body?, bodyBase64?, responseEncoding?, auth? })` | `http.fetch` (scope `hosts`) |
| `ctx.files` | `stat`, `read`, `write` (org workspace) | `files.read` / `files.write` |
| `ctx.accounts` | `list`, `report` | `accounts.use` (scope `connections`) |
| `ctx.accounts` | `access` — raw credentials, audited | `accounts.credentials` (high) |
| `ctx.bindings` | `channels(provider?)` (own bindings only) | — |
| `ctx.bindings` | `bind`, `unbind` | `bindings.write` |
| `ctx.runs` | `dispatch`, `cancel` | `runs.dispatch` |
| `ctx.runs` | `list` | `runs.read` |
| `ctx.threads` | `create` | `threads.create` |
| `ctx.threads` | `get`, `patch` | `threads.read` / `threads.write` |
| `ctx.threads` | `compact` | `threads.compact` (high) |
| `ctx.agents` | `list()` | `agents.read` |
| `ctx.usage` | `summary({ threadId?, since? })` | `usage.read` |
| `ctx.skills` | `list({ threadId? })` | `skills.read` |
| `ctx.triggers` | `fire`, `create`, `update` | `trigger` |
| `ctx.bridge` | `inbound(message)` | `bridge.inbound` |
| `ctx.workers` | `report`, `lease`, `release` | `worker` |
| `ctx.approvals` | `request(...)` | `approvals.request` |

Notes: `ctx.db` is a per-org SQLite file (`orgDataDir/<org>/addons/<addonId>/data.db`) with prepared statements only, SQL guard (`ATTACH`, `load_extension`, write pragmas blocked), operator ≤5s, result ≤8 MiB, `batch` ≤100. `ctx.secrets` cannot see other add-ons' secrets. `ctx.http.fetch` supports `auth` injection (`scheme: bearer | basic | header | path`) so the token never enters your process; only `https`, private addresses blocked. Full semantics: `docs/add-ons/context.md`.

`ctx.triggers.create/update` deal with the trigger instance target (`threadId`, `agentId`,
`modeId?`, `workspace?`). Host-owned `target.scripts` (pre/post shell commands with a gate)
is stripped on create and preserved on update; the add-on cannot read or arm scripts.

Two ways to authenticate `ctx.http.fetch`:

```ts
// a) connection-bound account (OAuth provider / GitHub App): the host injects
//    the credential; it never enters the add-on process.
await ctx.http.fetch({
  url: 'https://api.github.com/user',
  auth: { connection: 'gh', scheme: 'bearer' },
});

// b) static token without a provider connection (third-party API with no
//    accountKind): a config field with secret: true, read per call and passed
//    as a header — the token does enter the process on this path.
const token = await ctx.secrets.get('api_token');
if (token !== null) {
  await ctx.http.fetch({
    url: 'https://api.example.com/v1/items',
    headers: { authorization: `Bearer ${token}` },
  });
}
```

Path (b) is the fallback when no provider `accountKind` exists (see `manifest.md`); in the fake host, register a handler for the URL to test it (`FakeHttpHandler` in `createFakeHost`).

## Permission catalog

Baseline (always granted, never declared, never shown in consent): `config.read`, `log`, `db`, `secrets.own`, `events.emit.own`, `org.read`.

Gated (declare in the manifest, granted by the org):

| Id | Risk | Scope | Opens |
|---|---|---|---|
| `http.fetch` | medium | `{ hosts: string[] }` | `ctx.http.fetch` (egress allow-list) |
| `accounts.use` | medium | `{ connections: string[] }` | `ctx.accounts.list/report`, auth injection |
| `accounts.credentials` | high | `{ connections? }` | `ctx.accounts.access` |
| `runs.dispatch` | medium | — | `ctx.runs.dispatch/cancel` |
| `runs.read` | low | — | `ctx.runs.list` |
| `threads.create` | medium | — | `ctx.threads.create` |
| `threads.read` / `threads.write` | low / medium | — | `ctx.threads.get` / `patch` |
| `threads.compact` | high | — | `ctx.threads.compact` |
| `agents.read` | low | — | `ctx.agents.list` |
| `bindings.write` | medium | — | `ctx.bindings.bind/unbind` |
| `usage.read` | low | — | `ctx.usage.summary` |
| `skills.read` | low | — | `ctx.skills.list` |
| `events.subscribe` | low | `{ patterns: string[] }` | `hook` on core events |
| `files.read` / `files.write` | medium / high | — | `ctx.files.stat/read` / `write` |
| `bridge.inbound` | medium | — | `ctx.bridge.inbound` |
| `routes.public` | high | — | `exposure: "public"` routes |
| `trigger` | medium | — | `trigger` contribution + `ctx.triggers.*` |
| `worker` | medium | — | `ctx.workers.*` |
| `source` | medium | — | `source.*` handlers |
| `approvals.request` | medium | — | `ctx.approvals.request` |
| `lifecycle.resident` | medium | — | `activation: "resident"` |

The host's `PERMISSION_DEFINITIONS` (`apps/server/src/app/infra/addons/dispatcher/permission-definitions.ts`) is the source of truth; the SDK mirrors the ids in `packages/sdk/src/permissions/permissions.ts`.

## Consent flow

Effective access = baseline ∪ (manifest declaration ∩ org grant ∩ host policy). The check runs on **every** host call, so a revocation applies immediately.

1. **Enable** without the mandatory grants → `409 needs_consent` plus SSE `addon.consent_required`; the UI opens a dialog listing each permission with risk, scope, and `reason`.
2. **Update**: `grantDiff(old, new)`; a new mandatory permission → `needs_consent`, the org stays on the pinned version until consent. An update that narrows or keeps permissions applies without asking.
3. **Revoke**: `PUT .../grants`. The instance gets `permissions.changed`; revoking a mandatory permission stops the process with `permission_revoked`.
4. Host-level policy `~/.harnesys/addons-policy.json` (`GET/PUT /api/addons/policy`) intersects on top: forbidden permissions behave as never granted, `forbiddenHosts` extends the egress deny-list, `allowedSources` gates non-`builtin` installs.

Design rule: declare exactly the scope you use and degrade gracefully — `optional: true` permissions may never be granted, so gate features on `ctx.secrets.get(...) !== null` or on `initialize.permissions` behavior rather than assuming.

## Skills and prompts inside add-ons

Add-ons can ship org skills and prompts through a `content` contribution:

```json
{ "id": "howto", "family": "content",
  "descriptor": { "id": "howto", "title": "How to use this add-on", "kind": "skill", "path": "content/howto" } }
```

- `kind: "skill"` with `path` pointing inside the package (a directory containing `SKILL.md`, or a markdown file) registers an org skill. The host names it `addon-<addonId>-<skillId>`, where `skillId` is the descriptor `id`, sanitized to lowercase `[a-z0-9-]` and capped at 64 chars. Agents attach it by that name in their `skills` grant, exactly like a normal org skill.
- `kind: "prompt"` registers a prompt file from the package instead.
- A `tool-pack` may advertise related skills with `skills: ["howto"]`, where each entry is a `content` contribution **id** in the same add-on (cross-check: `unknown_skill`). They render with the pack.
- The host copies the skill body (frontmatter stripped) into the org skill directory as `SKILL.md`. Full skill catalogs (`SKILL.md` plus `references/*`) are the target behavior and are being landed; until that lands, keep each add-on skill **self-contained in a single `SKILL.md`** so nothing is lost on registration. Write the same frontmatter style as bundled skills (`name`, `description`, optional `when_to_use`).
