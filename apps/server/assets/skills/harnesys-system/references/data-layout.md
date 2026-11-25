# Data layout — where Harnesys keeps things

The host root is `~/.harnesys/` unless `harnesys.home` overrides it. Paths below are the ones `HostFsLayoutAdapter` returns (`apps/server/src/app/infra/fs-layout/host-fs-layout.adapter.ts`, port in `apps/server/src/app/domain/machine/host-fs-layout.port.ts`).

```
~/.harnesys/
  config.json                  # host config: id, name, listen address, token, publicOrigin
  machine.json                 # orgs known to this machine + activeOrgId (0600)
  machine.db                   # machine DB: presets table (system + user), plugin marketplaces/catalog
  identity.db                  # users, password hashes, memberships, invites, identity audit
  master.key                   # 32-byte base64 vault key (0600); overridable via config.harnesys.masterKey
  skills/                      # SYSTEM skill root, seeded from apps/server/assets/skills at boot
    .harnesys-seed.json        # bundled content hashes per skill, appVersion, seededAt
  presets/agents/*.json        # legacy one-file presets, imported once as local/<stem>
    .legacy-agents-imported    # marker written after the import
  marketplaces/<registryId>/   # cloned plugin marketplaces / registries
  add-ons/
    <addonId>/<version>/       # installed add-on packages
    addons.lock.json           # install lock
    .staging/  .extract/       # install scratch dirs
  orgs/<orgId>/                # one directory per organization (state)
    org.db                     # agents, threads, boards, issues, dashboards, plans, automations, trigger script runs, memory, knowledge index, usage
    settings.json              # org settings (e.g. skillsSourceAutoLoad)
    mcp.json                   # org MCP server config
    lsp.json                   # org language-server defaults
    skills/                    # ORG skill root (SKILL.md per directory)
    plugins/                   # installed org plugins
    plugins-data/              # plugin private data
    threads/<threadId>/        # per-thread attachments, sandbox, tool outputs, logs
  data/orgs/<orgId>/           # org data dir (workspace-bound artifacts)
    workspace/                 # managed workspace when no folder is chosen
    sources/<sourceId>/        # materialized source checkout or folder
    sources/<sourceId>.worktrees/  # git worktrees for issue/thread runs
    skills-staging/            # staging for skill installs
    addons/<addonId>/          # add-on private data: data.db, files/, logs/
  nodes/<orgId>.json           # node identity for multi-host setups
  tools/                       # host-managed tool binaries (agent-browser CLI)
  browser-artifacts/<session>/ # browser downloads/screenshots, auto-deleted after 7 days
```

## Databases

- SQLite via `bun:sqlite` + Drizzle, WAL mode (`-shm`/`-wal` files are normal).
- `machine.db` holds the preset library and plugin marketplace registry; `identity.db` holds users and memberships; each `org.db` holds everything org-scoped.
- Do not write these databases directly while the server runs; use the API or the agent tools.

## Skill roots

- System: `~/.harnesys/skills/` — seeded at every boot; an installed copy whose content differs from the bundle is replaced.
- Host: `~/.agents/skills/` — shared with other agent tools, read-only in the app.
- Org: `~/.harnesys/orgs/<orgId>/skills/`.
- `~/.harnesys/skills/.harnesys-seed.json` stores per-skill bundled hashes and drives the "Reset to bundled" action.

## Add-on data

An installed add-on owns `data/orgs/<orgId>/addons/<addonId>/`: `data.db` for its own schema, `files/` for blobs, `logs/`. Removing the add-on removes that directory; core tables never hold add-on data.

## Deleting an org

Removing an org deletes `orgs/<orgId>/` and `data/orgs/<orgId>/` (cascading by design: agents, threads, boards, dashboards, memory, skills, add-on data). `machine.json` loses the entry on the same path.
