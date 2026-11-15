# Install on a host

The host trusts a package by its **source**, not by its manifest. External packages
cloned from a URL or a registry are disabled; a package a person places on their own host
or uploads as a file is `local` trust and installs normally. The steps below are for that
path.

## Where packages live

```
~/.harnesys/add-ons/<id>/<version>/      # installed packages (versions sit side by side)
~/.harnesys/add-ons/addons.lock.json     # { id, version, digest, source, trust, installedAt }
~/.harnesys/add-ons/.staging/<planId>/   # install-plan staging
~/.harnesys/addons-policy.json           # host source/permission policy
```

The dev stand (`bun run dev`) uses `~/.harnesys-dev` instead. Never mix the two: the
installed host reads `~/.harnesys`.

## Option A — place the directory and reload

1. Copy your built package so the path is `~/.harnesys/add-ons/acme.example/1.0.0/`, with
   `addon.json` and `dist/index.js` at the top of that version directory.
2. In the desk open **Settings → Add-ons** and press **Reload** — that is
   `POST /api/addons/packages/rescan`. The host scans the home directory and registers any
   valid manifest not already in the lock. (A package operation needs a host-admin token;
   in the desk you are already that admin.)

The `builtin` add-ons shipped in the monorepo `add-ons/` directory are installed by
definition and are not available to external authors.

## Option B — Install package (folder or `.zip`)

In the same **Settings → Add-ons** screen, **Install package**:

1. Choose a folder on the host, or drop a `.zip` (up to 32 MiB; 5000 entries / 128 MiB
   decompressed). A zip must contain `addon.json` at its root or inside a single top-level
   folder.
2. The host runs **plan**: it stages a copy, computes the digest and validates the
   manifest, and shows you the id, version, trust, warnings and requested permissions.
   **No code runs during plan.**
3. **Confirm** moves the staged payload into place and writes the lock. Nothing is
   executed until you confirm.

Relevant endpoints (host-admin): `POST /api/addons/packages/plan { source }`,
`POST /api/addons/packages/plan/:planId/confirm`, `POST /api/addons/packages/upload`
(multipart field `file`), `POST /api/addons/packages/rescan`, `DELETE
/api/addons/packages/:id/:version`, `POST /api/addons/packages/prune`. The host policy
`GET/PUT /api/addons/policy` can restrict which source kinds are accepted via
`allowedSources` (tokens `local-dir`, `archive`, ...).

## Why URL/registry installs are disabled

An install from a URL or a registry is classified as `external` trust, and that source is
turned off until signed-package verification exists. The adapter is explicit:

> `external addon sources are disabled until the package verifier ships (ADDONS_PLAN §4.4/§21)`

and the install planner refuses the same case with "External sources are disabled until
signature verification exists". So today every package you can run is either `builtin`
(from the monorepo) or `local` (placed or uploaded on the host).

## Enable in an organization

Packages are installed per host; they are **enabled per organization**.

1. Open the add-on card `/o/<orgId>/settings/addons/<addonId>` and flip the toggle, or
   call `POST /api/orgs/<orgId>/addons/<addonId>/enable { grants: [...] }`.
2. Enabling runs compatibility checks, then consent. If the manifest declares mandatory
   permissions and their grants are missing, the call returns `409 needs_consent` with an
   SSE `addon.consent_required` event, and the desk opens the consent dialog. Approve it,
   and enabling proceeds: the version is pinned, migrations run, contributions register
   all-or-nothing, and state events are published.
3. The re-enable call carries the grants, for example:

   ```sh
   curl -X POST http://127.0.0.1:47474/api/orgs/$ORG/addons/acme.example/enable \
     -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
     -d '{"grants":[{"id":"http.fetch","scope":{"hosts":["api.example.com"]}}]}'
   ```

## Connect and configure

- **Connections**: for each declared `connections` entry, bind one or more accounts on the
  card (`PUT /api/orgs/<orgId>/addons/<addonId>/bindings/<connectionId> { accountIds }`).
  Until an account is bound, tools that need the connection return `account_failed` and the
  card shows `needsSetup`.
- **Config**: fill the `config` fields on the card
  (`PUT /api/orgs/<orgId>/addons/<addonId>/config { values, secrets? }`). `secret` fields
  are stored in the host vault and never appear in `ctx.config` — read them with
  `ctx.secrets.get`.

## Logs, health, quarantine

- **Health**: `GET /api/orgs/<orgId>/addons/<addonId>` returns `health`,
  `compatibility`, `permissions` and bindings. The card's `status` section mirrors it.
- **Logs**: `GET /api/orgs/<orgId>/addons/<addonId>/logs` (and the `/logs/stream` SSE
  feed). Every `ctx.log.*` line appears here.
- **Jobs**: `GET .../jobs`, `POST .../jobs/<jobId>/run` (Run now), `PATCH
  .../jobs/<jobId> { enabled }`.
- **Restart**: `POST .../restart`. **Quarantine**: more than 5 crashes in 10 minutes puts
  the instance in `quarantined`, which needs a manual reset via
  `POST .../quarantine/reset`.
- **Update / rollback**: `POST .../update { version, grants? }` and
  `POST .../rollback { version }`.
- **Uninstall**: `DELETE /api/orgs/<orgId>/addons/<addonId>?data=keep|purge`.

## What the agent should tell the owner

When an agent built or received an external add-on and cannot install it itself (no host
admin token), it hands off these exact steps:

1. **Put the package in place.** Copy the built directory to
   `~/.harnesys/add-ons/org.acme.myaddon/1.0.0/` — the path is `<home>/add-ons/<id>/<version>/`
   and the folder names must equal the manifest `id` and `version`. (On a dev stand the
   home is `~/.harnesys-dev`.)
2. **Register it.** Open **Settings → Add-ons** (`/o/<orgId>/settings/addons`) and press
   **Reload**. The add-on appears in the list. For a package from a folder or a `.zip`,
   press **Install package** instead, review the plan, then **Install**.
3. **Enable it.** Open the card `/o/<orgId>/settings/addons/<addonId>`, flip the toggle,
   and approve the consent dialog if it lists permissions.
4. **Connect and configure.** On the same card, **Connect** the required accounts and fill
   the **Config** fields (secret fields go to the vault).
5. **Confirm it works.** The card shows health `running`; check the **logs** panel; test a
   route or a job **Run now**; assign the tool pack to an agent and ask it to use a tool.

If the card is enabled but `stopped`, read the logs and press **Restart**; if it reports
`quarantined`, use the quarantine reset.

Next: [Troubleshooting](troubleshooting.md).
