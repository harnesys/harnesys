# Getting started

Goal: from an empty directory to a working agent tool installed on a host. The example is
the bundled template (`acme.example`): two tools, one route, a config form and a skill.

## 1. Scaffold

Fastest path — generate a ready-to-build package with the published scaffolder. The
directory name must be a valid add-on id (`<publisher>.<name>`, lowercase letters, digits
and dashes); pass `--id` otherwise:

```sh
bunx @harnesys/create-addon acme.example
cd acme.example
```

The generator copies the same template described below and rewrites the id, title,
description (pass `--description "<text>"` to set it explicitly), package name and SDK pin,
then prints the next commands. It never touches the network and never installs
dependencies.

Prefer to copy by hand? Grab `templates/external-addon/` from the Harnesys repository — in
the repo it is at `templates/external-addon/`, otherwise unzip it wherever you keep your code:

```sh
cp -R templates/external-addon ~/code/acme.example
cd ~/code/acme.example
```

The template is a complete package; on the manual path you rename it yourself in step 2.

## 2. Rename the add-on

Skip this step if you used the scaffolder in step 1 — it already set the id, title and
description.

Pick an id of the form `<publisher>.<name>` — lowercase letters, digits and dashes, at
least one dot (`^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$`). Update:

- `addon.json` → `id`, `title`, `description`, `version` (`1.0.0`), and the visible
  `REPLACE_ME` placeholders (`homepage`; adjust `icon` when you change the demo domain),
- `package.json` → `name`,
- `src/index.ts` → `ADDON_ID`, `ADDON_VERSION`.

The package **directory name must equal the manifest `id`** (`acme.example`), and the
version directory you install into later must equal `version`.

## 3. Install and build

```sh
bun install          # pulls @harnesys/sdk from your registry
bun run build        # bun build --target=bun src/index.ts --outfile dist/index.js
bun run typecheck    # tsc --noEmit
```

`bun run build` writes `dist/index.js`, which is what `runtime.entry` points at. The
bundle is self-contained — `node_modules` is never shipped.

## 4. Write code

The template is split by layer the way Harnesys add-ons are:

| File | Responsibility |
|---|---|
| `src/index.ts` | `defineAddon` wiring and the `startAddonProcess` guard |
| `src/tools.ts` | tool handlers (validation, config/secrets, db) |
| `src/routes.ts` | route handlers |
| `src/store.ts` | SQLite access for one table |

Handlers are keyed to match the manifest exactly:

- `tools: { add, list }` → `tool-pack` descriptor tool names `add`, `list`.
- `routes: { items }` → the `route` contribution `id: "items"`.
- `notifications: { 'config.changed': ... }` → the `config` contribution.

A contribution without a handler (or a handler without a contribution) fails the
instance handshake with `incompatible_handlers`. See [SDK and manifest](sdk-and-manifest.md).

## 5. Test without a host

`@harnesys/sdk/testing` runs the same runtime the host uses, over in-memory services and
the same permission checks. The template ships `src/index.spec.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseAddonManifest, validateManifest } from '@harnesys/sdk';
import { createFakeHost } from '@harnesys/sdk/testing';
import { addon } from './index.ts';

const rawManifest: unknown = await Bun.file(new URL('../addon.json', import.meta.url)).json();
const migration = await Bun.file(new URL('../migrations/0001_init.sql', import.meta.url)).text();
const manifest = parseAddonManifest(rawManifest);

const host = createFakeHost({ definition: addon, manifest, config: { default_tag: 'inbox' } });
await host.service('db.exec', { sql: migration });
const result = await host.callTool('bookmarks', 'add', {
  title: 'Docs',
  url: 'https://example.com/docs',
});
```

```sh
bun test
```

Two things the fake host does **not** do, so the test covers them explicitly:

- It does not apply your `migrations/*.sql` (the real host does, at enable time). Apply
  them yourself with `host.service('db.exec', { sql })`, as above.
- It implements the runtime services but not the supervisor, sandbox, transports or the
  secrets vault; test those on a real host.

Full fake-host API: [Troubleshooting](troubleshooting.md#the-fake-host-says-unsupported).

## 6. Package

There is no packer today: the package **is the directory**. What ships is the manifest,
the built bundle, any `migrations/`, `l10n/`, `content/` and `assets/` directories. Your
`src/`, `package.json`, `tsconfig.json`, lockfile and `node_modules` stay out. See
[Build and package](build-and-package.md).

## 7. Install on the host

Two equivalent paths (details in [Install on a host](install-on-a-host.md)):

- **Manual**: copy the built directory (with `dist/`) to
  `~/.harnesys/add-ons/<id>/<version>/`, then press **Reload** in **Settings → Add-ons**,
  which calls `POST /api/addons/packages/rescan`.
- **Install package**: in the same place, use **Install package** with a folder or a
  `.zip` (up to 32 MiB). It runs `plan` → `confirm`; nothing is executed until you confirm.

On the dev stand the home is `~/.harnesys-dev`, not `~/.harnesys`.

## 8. Enable and verify

1. Open the add-on card `/o/<orgId>/settings/addons/<addonId>` and flip the toggle, or
   `POST /api/orgs/<orgId>/addons/<addonId>/enable` with `{ "grants": [] }`. If the
   manifest asks for permissions, the enable returns `409 needs_consent` and the desk
   opens the consent dialog.
2. The card shows the software state: `status`, `capabilities`, `permissions`,
   `config`, `connections`. Fill the config fields (secrets are stored in the host vault).
3. Verify: health `running`, a line in the **logs** panel, the route
   `GET /api/orgs/<orgId>/addons/<addonId>/r/items`, and the tool from an agent that has
   the pack assigned.

Next: [SDK and manifest](sdk-and-manifest.md).
