# Dokploy

Harnesys on Dokploy is a **Compose** service (host + optional web). A single Dockerfile Application cannot run both containers.

Role is per organization on one machine: Create org → this host is relay for that org; Join/enroll → this host is worker and dials out to another relay.

## Choose compose file

| Goal | Compose path | Domain target |
|---|---|---|
| Host + WebUI | `deploy/docker-compose.yml` | service `web`, port `8080` |
| Host only | `deploy/docker-compose.host.yml` | service `host`, port `47474` |

Build context paths in those files are `..` (repo root) relative to `deploy/`.

## Host + WebUI

1. In the Dokploy project create a **Docker Compose** service (not Application).
2. Connect the GitHub repo, branch `main`, compose file `deploy/docker-compose.yml`.
3. Environment (Dokploy Environment editor → written as `.env` next to the compose file):

```env
PUBLIC_URL=https://harnesys.example.com
```

`PUBLIC_URL` becomes `host.publicOrigin` and the relay URL hint for orgs where this machine is relay.

Optional Google device OAuth (Drive on a headless VPS):

```env
HARNESYS_GOOGLE_DEVICE_CLIENT_ID=
HARNESYS_GOOGLE_DEVICE_CLIENT_SECRET=
HARNESYS_GOOGLE_API_KEY=
HARNESYS_GOOGLE_APP_ID=
```

4. Domains: point the hostname at service `web`, container port `8080`. Enable HTTPS.
5. Edge auth (optional, UI only): you may protect the SPA with Basic Auth, but if this machine serves any org as relay, leave `/api` and the WebSocket upgrades reachable without Basic Auth — browsers can attach no custom headers to SSE/WS, while API clients authenticate with their own session tokens. If Dokploy cannot exclude `/api`, use two hostnames (`app.*` → web with auth, `relay.*` → publish host `47474` via host-only compose or an extra port mapping) and set `PUBLIC_URL` to the relay hostname. Browser login happens in the app: `POST /api/session/login`, access token in memory, refresh cookie `harnesys.refresh`.
6. Deploy. Wait until `host` is healthy, then `web`.
7. Create the first owner on the relay before any browser login. The endpoint
   `POST /api/session/owner/init` answers only from loopback (see
   `apps/cli/README.md` → `harnesys owner init`). From the compose setup:

```bash
docker compose -f deploy/docker-compose.yml exec host bun -e '
  const response = await fetch("http://127.0.0.1:47474/api/session/owner/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ login: "owner", name: "Owner", password: process.env.OWNER_PASSWORD }),
  });
  console.log(await response.text());
'
```

   Then open `PUBLIC_URL` and sign in with that login/password on the relay login form.

Checks:

```bash
curl -sf https://harnesys.example.com/healthz
curl -sf https://harnesys.example.com/api/health/live
```

From another machine, enroll with `relayUrl=https://harnesys.example.com` (same origin as UI when using the default compose).

## Host only

1. Compose file `deploy/docker-compose.host.yml`.
2. Env: `PUBLIC_URL=https://relay.example.com` (and Google device vars if needed).
3. Domain → service `host`, port `47474`.
4. No WebUI; manage via CLI/desktop against this URL.

## Data

Compose mounts named volume `harnesys-data` at `/data` (`HARNESYS_HOME`). Keep org DBs, `config.json`, `machine.json`, and `master.key` on that volume. Do not store runtime data under Dokploy’s git `code/` checkout (it is wiped on redeploy).

## Local smoke

```bash
export PUBLIC_URL=http://127.0.0.1:8080
docker compose -f deploy/docker-compose.yml up -d --build
curl -sf http://127.0.0.1:8080/healthz
curl -sf http://127.0.0.1:8080/api/health/live
curl -sf -X POST http://127.0.0.1:8080/api/session/login -H 'Content-Type: application/json' -d '{"login":"owner","password":"wrong"}'
```

