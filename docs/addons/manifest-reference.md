# Manifest reference

`addon.json` is validated by `parseAddonManifest` / `validateManifest`
(`packages/sdk/src/manifest/`). JSON Schema for editors: `manifestJsonSchema()` and
`contributionDescriptorJsonSchema(family)` from `@harnesys/sdk`.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` |
| `version` | string | yes | semver `X.Y.Z` |
| `platform` | number | yes | integer, currently `1` |
| `title` | L10n | yes | string or locale map |
| `description` | L10n | yes | string or locale map |
| `icon` | string | no | |
| `homepage` | string | no | |
| `license` | string | no | |
| `runtime` | object | yes | `{ entry, profile: 'trusted' \| 'restricted' }` |
| `activation` | string | yes | `'lazy'` or `'resident'` |
| `permissions` | PermissionRequest[] | yes | see permissions-and-consent.md |
| `connections` | ConnectionRequirement[] | yes | see accounts-and-connections.md |
| `data` | object | no | `{ migrations: string, quotaMb?: number }` |
| `features` | string[] | no | |
| `contributions` | Contribution[] | yes | see contributions.md |

### L10n

`L10n = string | Record<locale, string>`. Resolution: requested locale → `en` → first
entry. Strings may contain `%key%` placeholders; every key must exist in `l10n/en.json`
(validation violation `missing_l10n_key`).

## Permission requests

```json
{
  "id": "http.fetch",
  "scope": { "hosts": ["api.github.com"] },
  "reason": "Fetch public GitHub profiles",
  "optional": false
}
```

- `id` must be a known permission id (validation `unknown_permission`).
- `reason` is shown in the consent dialog.
- `optional: true` permissions can be declined; mandatory ones cannot.
- Risk (`low`/`medium`/`high`) is host-side metadata derived from the permission id,
  not declared in the manifest.

Permission ids: see [permissions-and-consent.md](permissions-and-consent.md).

## Connections

```json
{
  "id": "github",
  "label": "GitHub installation",
  "accountKinds": ["github-installation"],
  "scopes": ["repo"],
  "cardinality": "one",
  "optional": true
}
```

- `accountKinds`: at least one; the org account's kind must match exactly when binding.
- `cardinality: 'one'` binds at most one account; `'many'` allows several.
- `optional: true` marks the connection as not required for operation.
- Descriptors that reference a connection (tool-pack, trigger, transport, source-kind,
  mcp, lsp, hook `providerEvent`) must use an id declared here (`unknown_connection`).

## Data

```json
{ "data": { "migrations": "migrations", "quotaMb": 16 } }
```

- `migrations`: directory of `NNNN_name.sql` files applied on enable/update.
- `quotaMb`: per-org storage quota; on exhaustion only size-reducing SQL
  (`DELETE`/`DROP`/`VACUUM`) is allowed.

## Runtime

- `entry`: path relative to the package root, loaded by the host.
- `profile: 'trusted'` — builtin/local packages run in-process; `'restricted'` — spawned
  as a separate process with OS sandbox. If the host cannot sandbox and the package is
  external with `trusted`, installation is refused unless
  `allowUnsandboxedExternal` is set in the host policy.

## Activation

- `'lazy'` (default): the process starts on first use (tool call, route, trigger start,
  job run, hook delivery) and idles out after ~5 minutes.
- `'resident'`: the host keeps it alive; requires `lifecycle.resident`.

## Validation

`validateManifest(raw)` returns `{ manifest, violations }` with severity `error`/`warning`.
Codes: `schema`, `unknown_permission`, `resident_without_permission`, `unknown_family`
(warning only for `optional` contributions), `descriptor_schema`, `unknown_connection`,
`duplicate_contribution_id`, `duplicate_id` (routes/jobs/workers), `missing_l10n_key`.
The host refuses to enable a package with error-severity violations.
