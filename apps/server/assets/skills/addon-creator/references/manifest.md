# addon.json

The manifest is static data the host validates at install and rescan. It is parsed by `addon.json` → `AddonManifestSchema` in `packages/sdk/src/manifest/manifest.ts`. The directory name must equal `id`.

## Required fields

| Field | Type / rule |
|---|---|
| `id` | `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` — `<publisher>.<name>`; must equal the package directory |
| `version` | `^\d+\.\d+\.\d+$` (three numeric parts, no prerelease) |
| `platform` | positive int; the host supports `1` today |
| `title` | L10n — string or `{ "en": "..." }` map |
| `description` | L10n |
| `runtime` | `{ "entry": "dist/index.js", "profile": "trusted" \| "restricted" }` |
| `activation` | `"lazy"` \| `"resident"` |
| `permissions` | array of `{ id, scope?, reason, optional? }` |
| `connections` | array of `{ id, label, accountKinds, scopes?, cardinality, optional? }` |
| `contributions` | array of `{ id, family, v?, optional?, descriptor }` |

## Optional fields

| Field | Type |
|---|---|
| `icon` | Lucide icon name in kebab-case (`"github"`) or `"assets/icon.svg"` |
| `color` | `#RRGGBB` |
| `homepage`, `license` | strings |
| `data` | `{ "migrations": "migrations", "quotaMb": 32 }` — `quotaMb` optional |
| `features` | string[] of hard host requirements, e.g. `"family:source-kind@1"` |

## Validation rules that bite

- `id` and directory must match. `add-ons/foo.bar/` with `"id": "foo.baz"` is rejected.
- L10n strings may contain `%key%` placeholders; keys resolve from `l10n/<locale>.json` in the package.
- `contributions[].id` must match `^[a-z][a-z0-9-]*$` (kebab-case, no dots). Descriptor ids (tool name, trigger `kind`, route `path`) are namespaced by the host as `<addonId>.<name>` where needed.
- Unknown `permission.id` → `unknown_permission`; only the ids in `packages/sdk/src/permissions/permissions.ts` (`KNOWN_PERMISSION_IDS`) are accepted.
- A contribution of an unknown family is fatal unless `optional: true`, in which case it is skipped with a warning.
- `platform` outside the host's supported set, or a `versions` mismatch on a descriptor `v`, is `incompatible` and cannot be enabled.
- `features` entries are hard requirements (`family:source-kind@1`).

## version and consent

- The organization pins a concrete version. Bump `version` on every change you ship; the host keeps multiple versions side by side.
- A grant is bound to the `grants_digest` of the version's permission declaration. A new version whose declaration is fully covered by the existing grant inherits it; otherwise the org gets `needs_consent` and stays on the pinned version until an admin consents.

## activation

| Value | Meaning | Extra requirement |
|---|---|---|
| `lazy` | Process starts on the first call/event and stops after 5 minutes idle | none |
| `resident` | Stays running | declare permission `lifecycle.resident` |

Jobs own their schedule on the host (`job` contribution); a lazy add-on with a job still needs no `lifecycle.resident`.

## permissions

Declare only non-baseline permissions, with the exact `scope` you use — the consent dialog shows everything the version asks for and re-asks on any widening.

```json
"permissions": [
  { "id": "http.fetch", "scope": { "hosts": ["api.example.com"] }, "reason": "Calls the Example API" },
  { "id": "accounts.use", "scope": { "connections": ["example"] }, "reason": "Use the bound account" }
]
```

Baseline ids (`config.read`, `log`, `db`, `secrets.own`, `events.emit.own`, `org.read`) are granted always and never declared. Contribution-derived ids (`trigger`, `worker`, `source`) gate their contribution and the matching `ctx.*` calls. `activation: "resident"` needs `lifecycle.resident`. The full catalog is in `context-and-permissions.md`.

`optional: true` lets an admin decline: the add-on still enables and must degrade gracefully (check `ctx.secrets.get(...) !== null` for "is it configured"). A mandatory permission cannot be declined.

## connections

```json
"connections": [
  { "id": "example", "label": "Example account", "accountKinds": ["oauth"], "cardinality": "many", "optional": true }
]
```

- `accountKinds` are provider account kinds from the Apps/Accounts layer; the host validates the bindings against them.
- `cardinality: "one" | "many"`. With `many`, a tool call must pass an explicit `accountId` unless exactly one account is bound (otherwise `conflict`).
- `connection` on a `tool-pack`/`trigger`/`source-kind` descriptor must be one of these ids (cross-check: `unknown_connection`).

## Forbidden

- No `postinstall` or any install script; the host copies verified files only.
- No `node_modules` in the shipped payload; bundle your runtime deps (`bun build --target=bun`).
- Trust is assigned by the **source**, not the manifest: `runtime.profile` chooses the execution mechanics, it does not grant trust. `external` packages must be `restricted` and are disabled until signing exists.
