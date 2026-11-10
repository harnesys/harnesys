# Getting started

## 1. Scaffold

Create a directory under `add-ons/` in the monorepo (system add-on, installed by definition):

```
add-ons/acme.greeter/
  addon.json          # manifest
  package.json        # name = addon id
  src/index.ts        # entry point
  migrations/0001_init.sql   # optional, see data-config-secrets.md
  l10n/en.json        # optional, for %key% placeholders
```

The directory name should match the addon id (`acme.greeter`). The id must match
`^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` — a publisher prefix, a dot, a name.

Minimal manifest:

```json
{
  "id": "acme.greeter",
  "version": "1.0.0",
  "platform": 1,
  "title": "Greeter",
  "description": "Says hello.",
  "runtime": { "entry": "dist/index.js", "profile": "trusted" },
  "activation": "lazy",
  "permissions": [],
  "connections": [],
  "contributions": []
}
```

- `platform` must be `1` (the host's platform major).
- `profile: 'trusted'` runs in-process for builtin packages; `'restricted'` requests an
  OS-sandboxed process. See packaging-lifecycle.md.
- `activation: 'resident'` requires the `lifecycle.resident` permission.

## 2. Define handlers

```ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';

export const addon = defineAddon({
  tools: {
    greet: (input, ctx) => {
      ctx.log.info('greeting', { name: input.name });
      return { text: `Hello, ${String(input.name)}!` };
    },
  },
  jobs: {
    'heartbeat': async (_params, ctx) => { /* periodic work */ },
  },
  routes: {
    'items-list': (request, ctx) => ({ status: 200, body: { items: [] } }),
  },
  hooks: {
    onThreadCreated: (params, ctx) => { /* params.event */ },
  },
  notifications: {
    'config.changed': (params, ctx) => { /* params.keys */ },
  },
});

if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: 'acme.greeter', version: '1.0.0' } });
}
```

Handler keys map to contribution ids declared in the manifest. The host only calls
handlers the add-on declared during the `initialize` handshake — a handler in code but
missing from the manifest contributions is dead; a contribution without a handler fails
the call with `unsupported`.

## 3. Build

```sh
bun build --target=bun src/index.ts --outfile dist/index.js
```

Do not ship `node_modules` inside the package: the digest computation rejects it.
Import `@harnesys/sdk` as a peer — it is provided by the host at runtime.

## 4. Install and enable

System add-ons (in `add-ons/`) are installed by definition — they appear on the
**Settings → Add-ons** page immediately. After creating the directory, press **Reload**
(or restart the host) so the builtin scan picks it up.

For a package outside the monorepo, place it into the host add-ons directory
(`~/.harnesys/add-ons/<id>/<version>/`) and press **Reload** on the Add-ons page,
or install via the **Install package** dialog from a path.

Enable it per organization: the Add-ons page lists the package with a switch. Enabling
runs migrations, opens the consent dialog for the permissions the manifest requests,
and registers all contributions. Org admins can then configure it, bind accounts,
and create trigger instances.

## 5. Verify

- Add-ons page: card shows version, `system` chip for builtins, enable state, health.
- Detail page (`/o/:orgId/settings/addons/:addonId`): status, permissions, config,
  connections, automations, jobs, diagnostics (restart, logs, metrics, data export).
- If the addon is enabled but `stopped`, check diagnostics → logs and restart.
- During development the host runs under `bun --watch`; process add-ons are restarted
  by the supervisor after crash (backoff 1s→60s). Quarantine after 5 crashes in 10 min
  must be cleared manually (Reset quarantine).
