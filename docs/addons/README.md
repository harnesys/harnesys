# Add-on development guide

Practical documentation for building add-ons for Harnesys. The authoritative design spec is
`docs/ADDONS_PLAN.md`; this guide is the developer-facing reference.

## Documents

| Document | Contents |
|---|---|
| [Getting started](getting-started.md) | Scaffold a package, define handlers, build, install, enable |
| [Manifest reference](manifest-reference.md) | `addon.json`: every field, permission, connection, validation rules |
| [Contributions](contributions.md) | All 13 contribution families and their descriptors |
| [Runtime API](runtime-api.md) | `defineAddon`, `AddonContext`, protocol, lifecycle, errors |
| [Permissions and consent](permissions-and-consent.md) | Permission ids, scopes, consent flow, host policy |
| [Data, config, and secrets](data-config-secrets.md) | Per-org SQLite, migrations, quota, config fields, secret store |
| [Accounts and connections](accounts-and-connections.md) | Connection requirements, bindings, `accounts.*` API |
| [Testing](testing.md) | `@harnesys/sdk/testing` fake host and fake DB |
| [Packaging and lifecycle](packaging-lifecycle.md) | Package layout, digest, sources, versions, update/rollback |
| [Migrating integrations to add-ons](migration-from-integrations.md) | Capability mapping from existing integrations + current gaps |

## Platform model

An add-on is a self-contained package with an `addon.json` manifest and a JS entry point.
The host launches the add-on as a separate process (or in-process for trusted builtin packages)
and talks to it over NDJSON JSON-RPC on stdio. The add-on declares what it contributes
(tools, triggers, jobs, routes, transport, hooks, UI views) and what it needs
(permissions, connections); the host grants, gates, and supervises everything at runtime.

Key invariants:

- The add-on never touches the host database directly. It gets its own SQLite database
  per organization (`ctx.db`), its own secrets namespace, and rate-limited host services.
- Every host call is permission-gated, Zod-validated, rate-limited (200 req/s, burst 400),
  deadline-bounded (30s default), and audited.
- Trust comes from the source, not the manifest: packages shipped in the monorepo `add-ons/`
  directory are `builtin`; packages installed from a local path are `local`.
- System add-ons live in `add-ons/` in the monorepo, ship with the app, and are installed
  by definition. Additional packages are installed from a path (external URL/registry sources
  are not enabled yet).

Reference implementation: [`add-ons/harnesys.starter`](../../add-ons/harnesys.starter/) —
config with a secret, tools, a periodic job, a trigger kind, routes with `:params`,
and a host-event hook. When in doubt, copy the starter.

## Current limitations (plan accordingly)

- `mcp`, `lsp`, and `source-kind` contribution families are registry stubs; descriptors are
  accepted but nothing consumes them yet.
- External install sources (URL/registry) are disabled until signature verification exists.
- There is no add-on API for HITL approvals, identity linking, or knowledge-source backends.
- `$/progress` notifications exist in the protocol but are not reachable from `AddonContext`.
- Transport channels are non-streaming (`capabilities.streaming` is always `false`).
