# Permissions and consent

Permission ids are fixed by the host (`packages/sdk/src/permissions/permissions.ts`);
unknown ids fail manifest validation.

## Baseline (always granted, not shown as consent items)

| Id | Grants |
|---|---|
| `config.read` | `ctx.config.get` |
| `log` | `ctx.log.*` |
| `db` | `ctx.db.*` (own per-org database) |
| `secrets.own` | `ctx.secrets.get` (own namespace only) |
| `events.emit.own` | `ctx.events.emit` (own `<addonId>.` prefix) |

## Gated permissions

| Id | Risk | Scope | Gates |
|---|---|---|---|
| `http.fetch` | medium | `{ hosts: string[] }` with `*.host` / `*` wildcards | `ctx.http.fetch` (egress allow-list) |
| `accounts.use` | medium | `{ connections: string[] }` | `ctx.accounts.list`, `ctx.accounts.report` |
| `accounts.credentials` | high | — | `ctx.accounts.access` (raw credentials; audited) |
| `events.subscribe` | low | `{ patterns: string[] }` | `hook` family event subscriptions |
| `bridge.inbound` | medium | — | `ctx.bridge.inbound` |
| `runs.dispatch` | medium | — | `ctx.runs.dispatch` |
| `threads.create` | medium | — | `ctx.threads.create` |
| `routes.public` | high | — | `exposure: 'public'` route contributions |
| `trigger` | medium | — | `trigger.start/stop`, `ctx.triggers.fire` |
| `worker` | medium | — | `worker.start/stop`, `ctx.workers.report` |
| `lifecycle.resident` | medium | — | `activation: 'resident'` |

`scope` narrows a permission: `http.fetch` without the host in scope fails with
`permission_denied`; an event hook subscribed to a pattern outside the `events.subscribe`
scope is rejected.

## Consent flow

1. Manifest requests permissions; the host computes effective permissions
   (declaration ∩ grants ∩ host policy) and `needsConsent` for mandatory ungranted ones.
2. **Enable**: if mandatory permissions are ungranted, enable returns `needs_consent`
   (409) and the UI opens the consent dialog listing each permission with its risk,
   scope, and the manifest's `reason`. Required permissions cannot be declined;
   optional ones can.
3. **Update**: on version update the host computes a grant diff; newly added mandatory
   permissions require consent again (`addon.consent_required` event).
4. **Revocation**: removing a grant for a mandatory permission stops the running
   instance with reason `permission_revoked`.

Grants are per organization. `PUT /api/orgs/:orgId/addons/:addonId/grants` is the REST
surface; grants not declared by the manifest are rejected (422).

## Host policy

The host administrator can forbid permissions or egress hosts globally
(`addons-policy.json` in the host home; `GET/PUT /api/addons/policy`):

- `forbiddenPermissions` — grants for these are stripped.
- `forbiddenHosts` — egress deny-list over `http.fetch` scopes.
- `allowedSources` — install sources allowed besides builtins (`local-dir` sentinel).
- `allowUnsandboxedExternal` — permits running external `trusted`-profile packages when
  OS sandboxing is unavailable.

Effective permissions are always `declaration ∩ grants ∩ policy`: a policy-forbidden
permission behaves as if never granted, and mandatory-but-forbidden permissions block
enable until the policy is relaxed.
