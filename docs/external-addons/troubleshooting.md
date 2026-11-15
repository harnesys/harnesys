# Troubleshooting

Most failures are fail-closed: the host refuses a broken or incompatible package rather
than degrading. Find the exact code below, then check the corresponding source.

## The manifest is rejected at plan/install

Validation returns every violation at once. Common codes:

| Code | Meaning | Fix |
|---|---|---|
| `schema` | a field failed the Zod schema | check the field's type and pattern (id, version, `platform`) |
| `unknown_permission` | a permission id is not in the catalog | use a known id or remove it |
| `unknown_family` | the family is unknown | use a real family, or mark the contribution `optional: true` to skip it with a warning |
| `descriptor_schema` | the descriptor failed its family schema | match the descriptor to the family |
| `unknown_connection` | a descriptor references an undeclared `connection` | declare it in `connections` |
| `duplicate_contribution_id` / `duplicate_id` | duplicate ids | make contribution ids unique; routes/jobs/workers also share a namespace |
| `resident_without_permission` | `activation: resident` without `lifecycle.resident` | add the permission or use `lazy` |
| `missing_l10n_key` | a `%key%` placeholder is absent from `l10n/en.json` | add the key |
| `manifest_missing` / `manifest_unparseable` | no `addon.json` at the package root or invalid JSON | fix the package layout / JSON |

A package with any error-severity violation cannot be enabled.

## `incompatible_handlers`

The instance failed the handshake because a declared contribution has no handler, or a
declared handler has no contribution. Check the pairing:

- every tool in the `tool-pack` needs a `tools` entry with the same name;
- every `route`/`job`/`worker`/`hook` needs a handler keyed by its contribution/descriptor
  **id**;
- every `trigger` needs a handler keyed by `descriptor.kind`;
- a `sources` handler is keyed by the source-kind id.

`defineAddon` computes the declared handler list; a mismatch is caught at startup, so the
fastest check is a parity test over `addon.handlers` versus the manifest (see the
template's `src/index.spec.ts`).

## Platform or feature not supported (`incompatible`)

The package is `incompatible` in the catalog and cannot be enabled. Causes:

- `platform` is not `1`;
- `features` lists something the host does not provide;
- a contribution's descriptor `v` is above the family's supported version;
- an _optional_ contribution of an unknown family is skipped with a warning — the package
  still installs.

Fix the manifest to match the host, or lower `platform`/`features` to what is supported.

## Consent: `409 needs_consent`

The manifest declares mandatory permissions that are not granted yet. In the desk the
consent dialog opens on enable or update; over REST, send the grants with the call:

```sh
POST /api/orgs/$ORG/addons/$ADDON/enable \
  -d '{"grants":[{"id":"http.fetch","scope":{"hosts":["api.example.com"]}}]}'
```

An update that adds a **new mandatory** permission also returns `needs_consent` and leaves
the organization on the pinned version until an admin consents. If a grant is missing at
runtime, calls return `permission_denied` — the add-on should degrade, not assume it.

## Connection `needsSetup` / `account_failed`

A tool that needs a connection returns `account_failed` (`accountCode: not_connected` or
`not_bound`) until an account is bound to every declared connection, and the card shows
`needsSetup`. Bind accounts on the card (`PUT .../bindings/:connectionId { accountIds }`).
`cardinality: 'one'` rejects a second binding with `409`.

## Digest drift

The lock records the digest computed at install. The host does not re-hash the package
directory on every start, so:

- editing files inside an already-registered `~/.harnesys/add-ons/<id>/<version>/` does not
  change what is recorded and may not take effect;
- rebuilding the same `version` produces a different digest, and the next confirm replaces
  the installed copy in place.

The reliable path is to **bump `version`**, rebuild, and reinstall (place the new version
directory and Reload, or install the new package). To drop stale copies, use **Prune
unused** (`POST /api/addons/packages/prune`) or delete the version
(`DELETE /api/addons/packages/:id/:version`, which returns `409 in_use` while an
organization pins it).

## `quarantined`

More than 5 process crashes in 10 minutes quarantines the instance; the card shows the
reason and the log tail, and the instance stays down until a manual reset
(`POST .../quarantine/reset`). Fix the crash first — a failing `trigger.start` replay or a
handler that throws on load is the usual cause — then reset. A single crash during a call
returns `unavailable` (retryable) and the host does not replay non-idempotent calls.

## `migration_failed` / `schema_newer`

A migration failed; the host restored the data database from a backup and refused the
change. `schema_newer` (status `409`) means the database `user_version` is higher than the
package's newest migration — you are rolling back below a schema that was already applied.
Roll forward with a version that still contains every applied migration, or restore the
matching version. Migration file names must match `NNNN_name.sql`.

## The fake host says `unsupported`

`@harnesys/sdk/testing` implements the runtime services but not the supervisor, sandbox,
transports, or the real secrets vault. In particular `workers.lease`/`release`,
`bindings.channels` and `secrets.set`/`delete` reply `unsupported` in the fake — exercise
those on a real host. If a test needs the schema, apply your migrations yourself with
`host.service('db.exec', { sql })`; the fake does not run `migrations/*.sql`.

## Nothing installs from a URL or registry

That is by design: `external` sources are disabled until package signature verification
ships. Install a `local` package (placed on the host or uploaded) instead. See
[Install on a host](install-on-a-host.md#why-urlregistry-installs-are-disabled).
