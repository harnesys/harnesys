# Packaging and lifecycle

## Package layout

```
acme.greeter/
  addon.json
  package.json          # name should equal the addon id
  src/index.ts
  dist/index.js         # build output, referenced by runtime.entry
  migrations/*.sql      # optional
  l10n/en.json          # optional
  content/*/SKILL.md    # optional content contributions
```

Build with `bun build --target=bun src/index.ts --outfile dist/index.js`.
Do not ship `node_modules` — the digest computation rejects unpackaged trees.

## Sources and trust

| Source | Where | Trust | Execution |
|---|---|---|---|
| Builtin | monorepo `add-ons/<name>/` | `builtin` | installed by definition; `trusted` profile runs in-process |
| Home catalog | `~/.harnesys/add-ons/<id>/<version>/` | `local` (registered manually or via install) | per launch policy |
| External (URL/registry) | — | `external` | **disabled** until signature verification exists |

- Trust comes from the source, not the manifest. `runtime.profile` selects the
  execution mode: `trusted` builtin/local packages run in-process; `restricted` packages
  spawn as separate processes with OS sandbox (macOS/Linux launchers). If the host cannot
  sandbox an external `trusted` package, it refuses unless
  `allowUnsandboxedExternal` is set in the host policy.
- **Reload** (Add-ons page → `POST /api/addons/packages/rescan`) re-scans both the
  monorepo `add-ons/` directory and the home catalog, registering package directories
  placed manually. Builtin scan results are cached per boot; rescan invalidates them.

## Lock and versions

The home catalog tracks installed versions in `~/.harnesys/add-ons/addons.lock.json`:
`entries[]` of `{ id, version, digest, source, trust, installedAt }`. Digest is
sha256 over sorted file paths + contents; it identifies the exact bytes of a version.
Multiple versions of one addon can coexist; organizations pin one version each.

## Install

1. `POST /api/addons/packages/plan { source }` — stages the package, validates the
   manifest, computes digest and trust, returns a plan (warnings, permissions).
2. `POST /api/addons/packages/plan/:planId/confirm` — moves the package into the home
   catalog and writes the lock entry.
3. Manual placement: drop `<id>/<version>/` into the home add-ons directory and
   **Reload** — the rescan registers valid manifests not yet in the lock.

## Org lifecycle

| Action | Endpoint | Effect |
|---|---|---|
| Enable | `POST orgs/:orgId/addons/:id/enable` | compat check → consent (if mandatory grants missing) → migrations → contribution registration → health mirror |
| Disable | `POST .../disable` | stops the instance, unregisters contributions, keeps pin and data |
| Update | `POST .../update` | compat check → grant diff (consent on new permissions) → stop → migrations → registry swap → pin update → restart; automatic pin rollback on failure |
| Rollback | `POST .../rollback` | pin an explicitly requested older installed version |
| Uninstall | `DELETE orgs/:orgId/addons/:id?data=keep\|purge` | remove from org; `purge` deletes the org data directory |
| Restart / quarantine reset | `POST .../restart`, `POST .../quarantine/reset` | diagnostics |

## Host-side lifecycle services

- **Supervisor**: single-flight `ensureRunning`, ping monitor (15s/5s/3 misses),
  RSS limit, restart backoff 1s→60s with jitter, crash breaker (5 crashes / 10 min →
  quarantined).
- **Reconciler** (30s tick): stops disabled-but-running instances, keeps alive those
  with reasons to live, cleans fire records older than 7 days, publishes
  `addon.update_available` when a newer version is installed.
- **Boot registration**: contributions are re-registered on host boot for every enabled
  org addon; failing addons are skipped and surface as compatibility/health errors.
- **Events** on the org bus: `addon.state_changed`, `addon.consent_required`,
  `addon.update_available`, plus `config.changed` / `permissions.changed`
  (add-ons see the latter two as notifications).

## Compatibility

`platform` in the manifest must match the host platform major (currently `1`);
contribution descriptor versions must be ≤ the host's supported family versions.
Incompatible packages are listed with reasons and cannot be enabled.
