# Dokploy

Harnesys ships as **one image** (`ghcr.io/harnesys/harnesys`) — host API + SPA + `/api` proxy in a single container, port `8080`. A `HARNESYS_WEB_ENABLED=false` env switch turns it into an API-only node (port `47474`).

Role is per organization on one machine: Create org → this host is relay for that org; Join/enroll → this host is worker and dials out to another relay.

## Quick path: one `docker run`

```bash
docker run -d --name harnesys \
  -p 8080:8080 \
  -v ~/.harnesys:/data \
  -e PUBLIC_URL=https://harnesys.example.com \
  -e OWNER_PASSWORD=change-me \
  --restart unless-stopped \
  ghcr.io/harnesys/harnesys:latest
```

Data lives in `~/.harnesys` on the host — the same home directory the desktop app uses (`HARNESYS_HOME` inside the container is `/data`, mounted from there). Override the host path with `HARNESYS_DATA_DIR` (compose) or your own `-v` target. On Dokploy, set `HARNESYS_DATA_DIR` to an absolute host path: a bare `~` can expand to an unexpected directory, and a wrong bind mount loses the volume (orgs and user toolchains alike) on redeploy. Do not run the desktop app and a container against the same `~/.harnesys` at the same time — the SQLite homes conflict; stop one before starting the other.

The first owner is created at boot from `OWNER_PASSWORD` (login defaults to `owner`, override with `OWNER_LOGIN`/`OWNER_NAME`). The hook fires only while no users exist — after that the variable is ignored, so it is safe to leave it set or remove it later. Then open `PUBLIC_URL` and sign in with that login/password.

Checks:

```bash
curl -sf https://harnesys.example.com/healthz
curl -sf https://harnesys.example.com/api/health
```

From another machine, enroll with `relayUrl=https://harnesys.example.com` (same origin as UI).

Pin a release instead of `latest` (e.g. `ghcr.io/harnesys/harnesys:0.10.4`) to control upgrades. Images are published by `.github/workflows/docker-publish.yml` — on `v*` release tags or manually via Actions → docker-publish → Run workflow (both produce `latest` + the version tag, amd64+arm64).

## Dokploy: Compose → Raw

1. In the Dokploy project create a **Docker Compose** service, provider **Raw**.
2. Paste `deploy/docker-compose.unified.yml`.
3. Environment tab: `PUBLIC_URL=https://harnesys.example.com` (and optional vars below).
4. Domains tab: hostname → service `app`, port `8080`, HTTPS on.
5. Deploy; the container must turn healthy. First owner: set `OWNER_PASSWORD` in the Environment tab before deploying (or after — then restart the service once).

## Env switches

| Variable | Default | Meaning |
|---|---|---|
| `PUBLIC_URL` | — | public origin, becomes `host.publicOrigin` and the relay URL hint |
| `HARNESYS_WEB_ENABLED` | `true` | `false` = API-only node (port `47474`, no UI) |
| `OWNER_PASSWORD` | required when `HARNESYS_WEB_ENABLED=false` | first owner password, applied at boot only while no users exist; API-only nodes refuse to start without it |
| `OWNER_LOGIN` / `OWNER_NAME` | `owner` / `Owner` | optional first-owner overrides |
| `HARNESYS_DATA_DIR` | `~/.harnesys` | host path bound to `/data` (compose only; with plain `docker run` pass your own `-v`) |
| `HARNESYS_MASTER_KEY` | generated into `/data` | optional fixed master key |
| `HARNESYS_GOOGLE_DEVICE_CLIENT_ID` / `..._SECRET` / `HARNESYS_GOOGLE_API_KEY` / `HARNESYS_GOOGLE_APP_ID` | — | optional Google device OAuth (Drive on a headless VPS) |

## Web search with SearXNG

Paste `deploy/docker-compose.searxng.yml` instead of the unified one — same `app` plus an internal-only SearXNG service (JSON API enabled, settings inlined via a compose config). After deploy, set the web pack provider to `searxng` with URL `http://searxng:8080` in the agent settings.

## Edge auth (optional, UI only)

You may protect the SPA with Basic Auth, but if this machine serves any org as relay, leave `/api` and the WebSocket upgrades reachable without Basic Auth — browsers can attach no custom headers to SSE/WS, while API clients authenticate with their own session tokens. If Dokploy cannot exclude `/api`, use two hostnames (`app.*` with auth, `relay.*` without) and set `PUBLIC_URL` to the relay hostname; in that case run the relay node with `HARNESYS_WEB_ENABLED=false` and publish its `47474`. Browser login happens in the app: `POST /api/session/login`, access token in memory, refresh cookie `harnesys.refresh`.

## Data

Everything persists in the bind mount at `/data` (`HARNESYS_HOME`), default host path `~/.harnesys` (override with `HARNESYS_DATA_DIR`): org DBs, `config.json`, `machine.json`, `master.key`. The path survives container redeploys; deleting it wipes the instance. Do not store runtime data under Dokploy’s git `code/` checkout (it is wiped on redeploy).

## Developer toolchain inside the container

The image ships `git`, `node`, `npm`, `curl`, and `unzip` (Debian slim, glibc) next to Bun, so the workspace tools work out of the box: skill/plugin install clones repos, the LSP "Install" buttons run `npm i -g` without extra setup, and private git sources authenticate through the credential helper that fetches tokens with `curl`. Go and Rust are not included — installing `gopls` or `rust-analyzer` from the UI returns a clear error until a Go/Rust toolchain is available on the host.

`HOME` inside the container points at `/data`, so **the whole home directory lives on the volume** and survives image updates: dotfiles, git identity (`/data/.gitconfig`), Bun globals (`/data/.bun`), npm globals (`/data/.npm-global`), node versions (`/data/.nvm/versions/node`), Go binaries (`/data/go/bin`), Rust/Cargo (`/data/.cargo`, `/data/.rustup`), and anything else written under `~`. Those directories are already on the effective PATH, so tools installed through a workspace terminal are picked up after a redeploy. `SHELL` is `/bin/zsh` (zsh and bash ship in the image) and interactive terminals receive the resolved PATH plus the persistent dirs above.

What does **not** survive: packages installed into system paths (`apt-get install ...`, files under `/usr/bin`, `/lib`). Those belong to the image layer, which is replaced on update. Install languages and tools into the home directory instead — `rustup`, `go install`, `nvm`, `npm i -g`, `bun add -g` all land on the volume with `HOME=/data`. The image is Debian (glibc) on purpose: browser engines downloaded by the browser pack are glibc builds and cannot run on a musl host.

Setup flow in the UI:

1. **Git identity** — Settings → VCS → "Git on this machine": set `user.name` / `user.email`; they are written to the global git config and used for commits. Pushing to HTTPS remotes still needs credentials (a PAT in the remote URL or a mounted SSH key); the identity alone is not authentication.
2. **Node versions** — Settings → Toolchain → "Install Node version": enter `22`, `22.14`, or a full version; it downloads the official build into the nvm layout and appears in the "Node version" picker. No version is imposed — pin any discovered version or leave it on Auto.
3. **Language servers** — Settings → Toolchain → Dependencies → Install (or LSP → Available servers → Add & install). Installs fall back to `bun add -g` when npm is absent.

Settings → Toolchain is not just diagnostics: the **Shell** picker chooses the shell for interactive terminals, and the Mode/extra-dirs/overrides define the PATH those terminals and agents receive.

### Updating the image

Redeploy pulls the new image; only the image layer changes, `/data` is untouched, and installed toolchains keep working. Check the update by opening Settings → Toolchain and pressing **Refresh** — discovered node versions, PATH dirs, and Dependencies states are re-probed. The only thing to redo manually after an update: anything the previous image provided that is gone in the new one (for example a package you added with `apt-get install` inside the running container).

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
