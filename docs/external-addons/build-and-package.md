# Build and package

A Harnesys add-on ships as a directory. The host copies verified files and never runs an
install script or a package manager, so everything your add-on needs at runtime must be in
the bundle.

## Build the bundle

```sh
bun build --target=bun src/index.ts --outfile dist/index.js
```

`dist/index.js` is the manifest `runtime.entry` (all built-ins use exactly this name).
The bundle is self-contained: it includes the SDK and any runtime dependency you import,
which is why `node_modules` never ships. There is no packer command today — the built
directory **is** the package.

## What is in the package

The host collects exactly these paths (everything else is ignored):

```
addon.json                 # the manifest
dist/index.js              # runtime.entry
notes.md                   # optional, shown on the card
migrations/                # the data.migrations directory
l10n/                      # translations for %key% placeholders
content/                   # files for content contributions (skills, prompts)
assets/                    # icons and other static files
```

Your `src/`, `package.json`, `tsconfig.json`, lockfile and `node_modules` are not part of
the package. Symlinks (e.g. workspace links) are skipped.

## Digest and installation

On install the host stages the payload, computes a **digest** — sha256 over the sorted
relative paths and contents — and records `{ id, version, digest, source, trust,
installedAt }` in `~/.harnesys/add-ons/addons.lock.json`. Confirm is idempotent: an
identical digest keeps the installed copy, while the same `id@version` with a different
digest (a rebuild) replaces the installed copy in place.

The recorded digest is a snapshot. The host does not re-hash the package directory on
every start, so manually editing files in an **already registered** version does not
change what was recorded — bump `version` and reinstall instead of editing in place.

## Versioning

- `version` is strict semver, `^\d+\.\d+\.\d+$` (no `-rc` suffixes). Bump it for every
  shipped change; the version directory and the manifest `version` must match.
- `platform` is the protocol major. Today only `1` is supported; an unsupported value
  makes the package `incompatible` (visible in the catalog, not installable).
- `features` is a hard list of host capabilities beyond `platform` (e.g.
  `family:source-kind@1`); a missing feature is also `incompatible`.
- Each contribution's descriptor schema version `v` must be supported by its family
  (all families are at `1`). An unknown **family** fails validation unless the
  contribution is `optional: true`, in which case it is skipped with a warning.

### What happens on update

`POST /api/orgs/:orgId/addons/:id/update { version, grants? }`:

1. Compatibility is checked, then the grant diff against the new version's permissions.
2. A **new mandatory permission** produces `needs_consent` (`409`) plus an SSE
   `addon.consent_required`; the organization stays on the pinned version until an admin
   consents. An update that keeps or narrows permissions applies without asking.
3. The instance is stopped, migrations run with a backup, registrations are swapped
   atomically, the pin changes, and the instance restarts. Any failure rolls the pin back
   and restores the data copy.

`POST .../rollback { version }` repins an already-installed earlier version; schema
downgrade protection may reject it (see below). `DELETE ...?data=keep|purge` uninstalls;
`purge` wipes the data database, files, logs, secrets and state.

## Migrations

Declare a directory in `data.migrations` and put numbered SQL files in it:

```
migrations/
  0001_init.sql
  0002_add_tag_index.sql
```

- File names must match `NNNN_name.sql` (four digits, underscore, then letters, digits,
  `_` or `-`). Duplicate numbers are rejected.
- Files are applied in ascending numeric order, each inside a transaction, and each sets
  `PRAGMA user_version` to its number.
- The host takes a backup of the data database before applying pending migrations (keeps
  the last three) and restores it if a migration fails, surfacing `migration_failed`.
- A package whose newest migration number is **lower** than the database `user_version`
  is refused (`migration_failed`, `schema_newer`) — this is the schema downgrade
  protection. Roll back to a version that still contains every applied migration.
- `lifecycle.upgrade({ fromVersion }, ctx)` runs after SQL migrations for logic you cannot
  express in SQL; make it idempotent.

Each add-on gets its own SQLite database per organization
(`<org data dir>/addons/<addonId>/data.db`) with a `quotaMb` from `data.quotaMb`. The same
SQL authorizer as the tests applies: `ATTACH`, `DETACH`, `load_extension` and write
pragmas are denied; `PRAGMA user_version`/`foreign_keys` are allowed.

## Limits

| Limit | Value | Where |
|---|---|---|
| Bundle message size | 8 MiB per protocol message | protocol envelope |
| Uploaded `.zip` size | 32 MiB | install `upload` route |
| Archive entries / decompressed size | 5000 entries / 128 MiB | archive extraction |
| Contribution descriptor | 256 KiB / depth 16 | manifest load |
| Tool `inputSchema`/`outputSchema` | 64 KiB / depth 8 | descriptor validation |
| Tool call timeout / result size | `timeoutSec` 60 (cap 600) / `maxResultKb` 256 | tool descriptor |
| Job timeout | 900 s (cap 3600 s) | job descriptor |
| Skill supporting files | 32 files, 256 KiB each, 1 MiB total | content contribution |

## Installing the SDK

Your `package.json` depends on `@harnesys/sdk`:

```json
"dependencies": { "@harnesys/sdk": "^1.0.0" }
```

The template pins `^1.0.0` for the published SDK. Until the npm release is available in
your registry, point the dependency at a local checkout for development:

```json
"dependencies": { "@harnesys/sdk": "file:/path/to/harnesys/packages/sdk" }
```

Switch back to the version range before you publish or hand the package over — a `file:`
dependency is an absolute path and will not resolve on another machine.

Next: [Install on a host](install-on-a-host.md).
