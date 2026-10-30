# Data layout — where Harnesys keeps things

Host root is `~/.harnesys/` (overridable by config). Layout as implemented in `HostFsLayoutPort` (`apps/server/src/app/domain/machine/host-fs-layout.port.ts`):

```
~/.harnesys/
  config.json            # machine-level config (ports, providers, connector keys)
  machine.json / machine.db   # machine-wide state: presets table (system+user+registry), plugin registries/catalog
  identity.db            # users, logins, password hashes, identity audit
  master.key             # vault encryption key
  github-app.json        # GitHub App credentials (if configured)
  skills/                # system skills root (seeded from the app bundle at boot)
  presets/               # legacy import staging for user presets
  orgs/<orgId>/          # one directory per organization
    org.db               # the org's database: agents, threads, boards/issues, plans, schedules, memory stores
    threads/<threadId>/  # per-thread attachments and logs
  data/orgs/<orgId>/     # org data dir (workspace-linked artifacts, sources, worktrees)
  marketplaces/          # installed marketplace/registry clones
  nodes/                 # node identity for multi-host setups
  browser-artifacts/     # web pack browser session artifacts
  engines/               # bundled browser/LSP engines
  tools/                 # host-managed tool binaries
```

Inside a workspace the project-level directory is `<workspace>/.harnesys/`:

```
.harnesys/
  skills/                # workspace skills (<name>/SKILL.md)
  mcp.json               # MCP server configurations for this org
```

## Databases

- SQLite (via `bun:sqlite` + Drizzle). Machine DB holds the preset library; identity DB holds users; each org DB holds everything org-scoped.
- WAL mode (`-shm`/`-wal` files are normal). Do not write to these databases directly while the server is running; use the API/tools.

## Seeding markers

- `~/.harnesys/skills/.harnesys-seed.json` — per-skill content hashes of bundled skills, used to flag "update available" in the WebUI and to restore system skills to their bundled state. User edits to installed system skills are preserved; restore overwrites them deliberately.

## Deleting an org

Removing an org removes its directory under `orgs/` and `data/orgs/` (cascading, by design: agents, threads, boards, memory all live there).
