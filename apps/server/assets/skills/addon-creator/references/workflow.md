# Add-on workflow

The path from "I need an add-on" to a working feature in an organization.

## 0. Pick the closest built-in and copy its shape

Do not invent a structure. Read the same-role add-on first, then mirror it.

| Need | Copy from |
|---|---|
| Minimal complete add-on: tool-pack + org routes + job + trigger + `view` + migrations | `add-ons/harnesys.webhook` (walkthrough: `docs/add-ons/anatomy.md`) |
| Cron/job scheduling, resident activation, org timezone, HITL escalation | `add-ons/harnesys.scheduler` |
| Chat transport (`transport`) + worker poller + tool-pack + bindings | `add-ons/harnesys.telegram-bot` |
| Tool-pack over a `cardinality: many` connection, no transport | `add-ons/harnesys.telegram-tools` |
| Accounts + `ctx.http.fetch` (OAuth provider, GitHub App) | `add-ons/harnesys.github`, `add-ons/harnesys.google-*` |
| Smallest add-on: `viewer` + two routes | `add-ons/harnesys.drawio` |

Then read that add-on's `addon.json` and `src/index.ts` top to bottom before writing.

## 1. Scaffold the package

```
add-ons/<id>/
  addon.json
  package.json
  tsconfig.json
  src/index.ts
  dist/index.js             # build output; this is runtime.entry
  migrations/0001_init.sql  # only when data.migrations is declared
  l10n/en.json              # only for %key% placeholders in L10n strings
  content/...               # only for content contributions (skills/prompts)
  assets/icon.svg           # optional icon
```

`package.json` (copy the exact shape from a built-in; `module` points at source, `build` writes `dist`):

```json
{
  "name": "<id>",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "module": "src/index.ts",
  "scripts": {
    "build": "bun build --target=bun src/index.ts --outfile dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@harnesys/sdk": "file:../../packages/sdk" },
  "devDependencies": { "@types/bun": "latest", "typescript": "^5.9.3" }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "types": ["bun"] },
  "include": ["src/**/*.ts"]
}
```

Built-in add-ons in the monorepo may also import `@harnesys/studio-shared` (`file:../../packages/studio-shared`). External packages may import **only** `@harnesys/sdk`.

## 2. Write code, then build

Edit `addon.json` and `src/*.ts` (manifest fields in `manifest.md`, handlers in `code-contract.md`), then from the repo root:

```sh
bun run addon:build            # all add-ons
bun run addon:build webhook    # one; accepts the full id or the id without the harnesys. prefix
```

`scripts/addon-build.ts` resolves `add-ons/<name>`, runs `bun install` in the package when `node_modules/@harnesys/sdk` is missing, then `bun run build` (which is exactly `bun build --target=bun src/index.ts --outfile dist/index.js`). It builds in place; no install script ever runs on the host.

Local checks in the package directory:

```sh
bun run typecheck        # tsc --noEmit
bun test                 # *.spec.ts under src/ (bun test only; no e2e, no RTL)
bunx biome check .       # style, kebab-case, no any/console/!
```

## 3. Local test without a host

`@harnesys/sdk/testing` runs the same `createAddonRuntime` over in-memory services and the same permission coverage as the live host.

```ts
// src/index.spec.ts
import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import { createFakeHost } from '@harnesys/sdk/testing';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index.ts';

describe('<id>', () => {
  test('greet tool returns text and logs', async () => {
    const host = createFakeHost({ definition: addon, manifest: parseAddonManifest(rawManifest) });
    const result = await host.callTool('greeter', 'greet', { name: 'Ada' });
    expect(result).toEqual({ output: { text: 'Hello, Ada!' } });
    expect(host.logs.some((l) => l.message === 'greeting')).toBe(true);
    host.close();
  });
});
```

`createFakeHost` checks manifest↔definition parity, enforces grants (a missing grant returns `permission_denied` like the host), runs an in-memory SQLite with the host's SQL authorizer, and records `host.logs`, `host.emitted`, `host.dispatchedRuns`, `host.fileWrites`, etc. `workers.lease/release`, `bindings.channels`, `secrets.set/delete` are **not** implemented in the fake (`unsupported`); test those on a live stand. Drivers: `host.callTool(pack, tool, input?)`, `host.callRoute(routeId, request)`, `host.runJob(jobId)`, `host.startTrigger(...)`, `host.startWorker(id)`, `host.emit(...)`, `host.notify(...)`, `host.advanceTime(ms)`.

## 4. Install on the host

The host never runs install scripts; it copies verified files. Packages live at `~/.harnesys/add-ons/<id>/<version>/` with a digest in `addons.lock.json`. Trust comes from the source, not the manifest (`builtin` for the monorepo `add-ons/`, `local` for the home dir, `external` disabled until signing exists).

- **Monorepo dev stand** (`bun run dev`, API `:47473`, home `~/.harnesys-dev`): a new/updated directory in `add-ons/` is picked up by `POST /api/addons/packages/rescan` — the **Reload** button on Settings → Add-ons — or by restarting the stand.
- **Outside the monorepo**: place `~/.harnesys/add-ons/<id>/<version>/`, then Reload; or use **Install package** in Settings → Add-ons (upload/`.zip` flow runs `plan` → `confirm`, nothing executes).
- Installed host uses `~/.harnesys`; the dev stand uses `~/.harnesys-dev`. Do not mix them.

## 5. Enable, connect, configure, verify

1. Open the add-on's card in the organization and flip the toggle, or `POST /api/orgs/:orgId/addons/:id/enable` with `{ grants }`. Mandatory permissions trigger a consent dialog (`409 needs_consent` without them).
2. **Connect** each declared `connections` entry: bind provider accounts on the card (`PUT .../bindings/:connectionId`). Tools that need a connection return `account_failed` / show `needsSetup` until bound.
3. **Configure** the `config` contribution fields on the card (`PUT .../config`); secret fields are stored in the host vault.
4. Verify (exact endpoints in `install-and-handoff.md`): card health `running`, `GET /api/orgs/:orgId/addons/:id` (`health`, `compatibility`, `permissions`), halo route `.../r/<path>`, job **Run now**, tool via an agent that has the pack, and `GET .../logs`.

If the card shows enabled but `stopped`, read `GET .../logs` and press **Restart**; 5 crashes in 10 minutes quarantine the instance behind a manual reset.
