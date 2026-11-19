# Dokploy

Harnesys ships as **one image** (`ghcr.io/harnesys/harnesys`) — host API + SPA + `/api` proxy in a single container, port `8080`. A `HARNESYS_WEB_ENABLED=false` env switch turns it into an API-only node (port `47474`).

Role is per organization on one machine: Create org → this host is relay for that org; Join/enroll → this host is worker and dials out to another relay.

## Quick path: one `docker run`

```bash
docker run -d --name harnesys \
  -p 8080:8080 \
  -v harnesys-data:/data \
  -e PUBLIC_URL=https://harnesys.example.com \
  -e OWNER_PASSWORD=change-me \
  --restart unless-stopped \
  ghcr.io/harnesys/harnesys:latest
```

Create the first owner before any browser login. `POST /api/session/owner/init` answers only from loopback, so it runs inside the container:

```bash
docker exec harnesys bun -e 'const r = await fetch("http://127.0.0.1:47474/api/session/owner/init", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({login: "owner", name: "Owner", password: process.env.OWNER_PASSWORD})}); console.log(await r.text());'
```

Then open `PUBLIC_URL` and sign in with that login/password.

Checks:

```bash
curl -sf https://harnesys.example.com/healthz
curl -sf https://harnesys.example.com/api/health
```

From another machine, enroll with `relayUrl=https://harnesys.example.com` (same origin as UI).

Pin a release instead of `latest` (e.g. `ghcr.io/harnesys/harnesys:0.10.4`) to control upgrades. Images are published by `.github/workflows/docker-publish.yml` (`latest` on `main`, semver on `v*` tags, amd64+arm64).

## Dokploy: Compose → Raw

1. In the Dokploy project create a **Docker Compose** service, provider **Raw**.
2. Paste `deploy/docker-compose.unified.yml`.
3. Environment tab: `PUBLIC_URL=https://harnesys.example.com` (and optional vars below).
4. Domains tab: hostname → service `app`, port `8080`, HTTPS on.
5. Deploy; the container must turn healthy. First owner: Containers → `app` → **Open Terminal**, run the `bun -e '...'` one-liner from the quick path (the container env already has `OWNER_PASSWORD`).

## Env switches

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_URL` | — | public origin, becomes `host.publicOrigin` and the relay URL hint |
| `HARNESYS_WEB_ENABLED` | `true` | `false` = API-only node (port `47474`, no UI) |
| `HARNESYS_MASTER_KEY` | generated into `/data` | optional fixed master key |
| `HARNESYS_GOOGLE_DEVICE_CLIENT_ID` / `..._SECRET` / `HARNESYS_GOOGLE_API_KEY` / `HARNESYS_GOOGLE_APP_ID` | — | optional Google device OAuth (Drive on a headless VPS) |

## Edge auth (optional, UI only)

You may protect the SPA with Basic Auth, but if this machine serves any org as relay, leave `/api` and the WebSocket upgrades reachable without Basic Auth — browsers can attach no custom headers to SSE/WS, while API clients authenticate with their own session tokens. If Dokploy cannot exclude `/api`, use two hostnames (`app.*` with auth, `relay.*` without) and set `PUBLIC_URL` to the relay hostname; in that case run the relay node with `HARNESYS_WEB_ENABLED=false` and publish its `47474`. Browser login happens in the app: `POST /api/session/login`, access token in memory, refresh cookie `harnesys.refresh`.

## Data

Everything persists in the `harnesys-data` volume mounted at `/data` (`HARNESYS_HOME`): org DBs, `config.json`, `machine.json`, `master.key`. Do not store runtime data under Dokploy’s git `code/` checkout (it is wiped on redeploy).

## Advanced path: build from source

Two-image variant for self-builders (host and web built separately): `deploy/docker-compose.yml` (host + web, domain → `web:8080`) or `deploy/docker-compose.host.yml` (host only, domain → `host:47474`). Build context paths are `..` (repo root) relative to `deploy/`. Building on the VPS needs ~4 GB RAM and several minutes.

## Local smoke

```bash
docker build -f deploy/unified.Dockerfile -t harnesys .
docker run -d --name harnesys-smoke -p 8080:8080 -e PUBLIC_URL=http://127.0.0.1:8080 harnesys
curl -sf http://127.0.0.1:8080/healthz
curl -sf http://127.0.0.1:8080/api/health
curl -sf -X POST http://127.0.0.1:8080/api/session/login -H 'Content-Type: application/json' -d '{"login":"owner","password":"wrong"}'
docker rm -f harnesys-smoke
```
