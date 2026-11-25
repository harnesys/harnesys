# Install and handoff

## Where packages live

```
~/.harnesys/add-ons/<id>/<version>/   # installed packages; versions sit side by side
~/.harnesys/add-ons/addons.lock.json  # { id, version, digest, source, trust, installedAt }
~/.harnesys/add-ons/.staging/<planId>/ # install plan staging
~/.harnesys/addons-policy.json         # host source/permission policy
```

The dev stand (`bun run dev`) uses `~/.harnesys-dev` instead of `~/.harnesys` — never mix them. In the monorepo, built-in add-ons in `add-ons/` are installed by definition and need no lock entry.

## WebUI: Settings → Add-ons

List page `/o/:orgId/settings/addons`. Buttons on the pane (`apps/webui/src/features/manage-addons/manage-addons-pane.tsx`):

| Button | Endpoint |
|---|---|
| **Reload** | `POST /api/addons/packages/rescan` |
| **Install package** | `POST /api/addons/packages/plan` → `POST /api/addons/packages/plan/:planId/confirm` (or `.zip` upload); nothing executes until confirm |
| **Prune unused** | `POST /api/addons/packages/prune` |
| **Source policy** | `GET / PUT /api/addons/policy` |

`plan` **is the dry-run**: it stages and validates the package (manifest parse, source policy, platform compatibility) and returns the plan without installing anything. Plans expire in the plan store; simply never calling `confirm` leaves the host untouched. Use it as the pre-handoff gate — plan the final zip, check `warnings` and `permissions` in the response, and only then hand off. Note the plan does not execute handlers: manifest↔handler parity is verified by `createFakeHost` locally and by the instance handshake on first start.

Add-on card `/o/:orgId/settings/addons/<addonId>` (`addon-detail-page.tsx`): the toggle (enable), the **consent dialog** for mandatory permissions, **connections** (bind accounts → `PUT .../bindings/:connectionId`), **config** form, **automations** (trigger instances), **jobs** (**Run now**), delegated `table`/`form`/`actions`/`frame` sections, and the **logs** panel. Default sections when the add-on declares no `view`: `status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`.

## REST path (agent with a session token)

Base `http://127.0.0.1:47473` on the dev stand. Host-admin package operations need an owner token with capability `host.promote` plus `X-Org-Id`; org operations need an org session.

```sh
B=http://127.0.0.1:47473
TOKEN=...            # session access token
ORG=...              # org id
XORG="X-Org-Id: $ORG"

# packages
curl -s $B/api/addons/packages -H "authorization: Bearer $TOKEN" -H "$XORG"
curl -s -X POST $B/api/addons/packages/rescan -H "authorization: Bearer $TOKEN" -H "$XORG"

# install by name/path/url: plan, then confirm by planId
PLAN=$(curl -s -X POST $B/api/addons/packages/plan -H "authorization: Bearer $TOKEN" -H "$XORG" \
  -H 'content-type: application/json' -d '{"source":"acme.greeter"}' | jq -r .planId)
curl -s -X POST $B/api/addons/packages/plan/$PLAN/confirm -H "authorization: Bearer $TOKEN" -H "$XORG"

# enable with grants (mandatory grants missing → 409 needs_consent)
curl -s -X POST $B/api/orgs/$ORG/addons/acme.greeter/enable \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grants":[{"id":"http.fetch","scope":{"hosts":["api.example.com"]}}]}'

# configure, bind accounts
curl -s -X PUT $B/api/orgs/$ORG/addons/acme.greeter/config \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"values":{"default_repo":"acme/api"},"secrets":{"api_note":"s3cret"}}'
curl -s -X PUT $B/api/orgs/$ORG/addons/acme.greeter/bindings/example \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"accountIds":["acc-1"]}'

# verify
curl -s $B/api/orgs/$ORG/addons/acme.greeter -H "authorization: Bearer $TOKEN" | jq '.health, .compatibility, .permissions'
curl -s $B/api/orgs/$ORG/addons/acme.greeter/r/greeting -H "authorization: Bearer $TOKEN"
curl -s -X POST $B/api/orgs/$ORG/addons/acme.greeter/jobs/heartbeat/run -H "authorization: Bearer $TOKEN"
curl -s $B/api/orgs/$ORG/addons/acme.greeter/logs -H "authorization: Bearer $TOKEN" | jq '.items[-1]'
```

State changes also arrive over SSE at `GET /api/orgs/:orgId/addons/events` (`addon.state_changed`, `addon.update_available`, `addon.consent_required`). There is **no CLI for add-ons**: the `hxa` tool is a roadmap item; today the build command is `bun run addon:build` and the packaging command is `bun run addon:pack <dir-or-name> [--out <zip>]` (payload: `addon.json` + `dist/`/`migrations/`/`l10n/`/`content/`/`assets/` + `notes.md`, zip layout `addon.json` inside one top-level directory — the host also accepts `addon.json` at the archive root).

If you have no `web.fetch` or no token, you cannot install or enable anything. Prepare the built package, then hand the rest to the user with the WebUI steps below.

## Handoff to the user

After the package builds and passes checks, tell the user exactly this (fill in `<id>`, `<addonId>`, `<orgId>`):

1. Validate first without installing: `POST /api/addons/packages/plan` with the zip (or `bun run addon:pack` output) and check the returned plan — no confirm, host untouched.
2. Put the package in place: in the monorepo, the directory `add-ons/<id>/` is enough; otherwise copy it to `~/.harnesys/add-ons/<id>/<version>/` (dev stand: `~/.harnesys-dev/add-ons/...`).
3. Open **Settings → Add-ons** (`/o/<orgId>/settings/addons`) and press **Reload**; the add-on appears in the list. For a package from a path or `.zip`, use **Install package** instead (review the plan, then confirm).
4. Open the add-on card (`/o/<orgId>/settings/addons/<addonId>`), flip the toggle, and approve the consent dialog if it lists permissions.
5. On the same card: **Connect** the required accounts, fill the **Config** fields, and create any **Automations** (triggers). If the trigger needs a preflight check, generate step, gate or cleanup, open the automation gear -> **Scripts**, configure the pre/post command, tick the consent box and press **Test**.
6. Confirm it works: the card shows health `running`; check the **logs** panel; test a route or a job **Run now**; grant the pack to an agent and try a tool. For a gated trigger, set a deliberately failing condition once and confirm the run is suppressed and appears under **Recent script runs**.

## Pre-handoff checklist

- `bun run addon:build <name>` (or `addon:build --path <dir>` outside the monorepo) succeeds and `dist/index.js` matches `runtime.entry`.
- `bun run typecheck` and `bun test` pass; `bunx biome check .` is clean in the package.
- Handler maps and manifest contributions match exactly (a missing pair fails `incompatible_handlers`).
- `version` was bumped for the shipped change.
- No secret value appears in `ctx.config`, code, or `ctx.log` lines.
- `trigger.start`/`worker.start`/`lifecycle.upgrade` are idempotent; `runKey` is deterministic.
- If the trigger has a preflight/gate/cleanup need, the handoff names the **Scripts** block (pre/post, gate, failure policy, Test) instead of claiming the add-on handles it.
- `grep` the package for `console` and `: any` / `as any` / `!` — none remain.
- You told the user the exact path in the WebUI and how to verify enablement (`GET /api/orgs/:orgId/addons/:id`, logs, a route/job/tool).
