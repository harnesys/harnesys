# Harnesys

Self-hosted fleet control plane for harness agents: a host API, web UI, CLI, and desktop shell to run, observe, and manage AI agent fleets across machines.

One binary (or container) acts as a **relay** for an organization; worker hosts enroll into it. Agents get threads, tools, skills, MCP servers, knowledge bases, approvals, schedules, and webhooks — with a real-time UI on top.

## Packages

| Path | What it is |
|---|---|
| [`apps/server`](apps/server) | Host API: Hono + Brix (DI), Drizzle + SQLite (`bun:sqlite`), Zod, Pino, Croner |
| [`apps/webui`](apps/webui) | SPA client: Vite 8, React 19 + React Compiler, Tailwind 4, TanStack Query 5, Monaco, xterm |
| [`apps/cli`](apps/cli) | Single-binary CLI: sessions, fleet pairing (invite/enroll/retarget/promote), diagnostics |
| [`apps/desktop`](apps/desktop) | Tauri v2 shell: bundles the WebUI and the host API as a sidecar, tray, auto-update |
| [`packages/brix`](packages/brix) | Nest-style DI/module framework on top of Hono for Bun |
| [`packages/contracts`](packages/contracts) | Pure Zod REST contracts shared by server and clients |
| [`packages/harnesys`](packages/harnesys) | Agent engine: run engine, tool registry, capability packs, model bindings |
| [`packages/studio-shared`](packages/studio-shared) | Shared types and pure helpers |

## Quick start

```bash
bun install
cp .env.example .env      # optional, see apps/server/.env.example
bun run dev               # host API on :47474 + web UI on :5173
```

Health check: `GET http://127.0.0.1:47474/api/health` → `{"status":"ok"}`.

## Production build

```bash
bun run build:host       # build/harnesys-host + bundled assets
bun run build:web        # build/harnesys-web (SPA + proxy server)
bun run build:cli        # build/harnesys
bun run build:desktop    # Tauri bundles (dmg/nsis/appimage/deb)
```

Docker: `deploy/docker-compose.yml` (host + web), guides in [`deploy/DOKPLOY.md`](deploy/DOKPLOY.md).

## Development

```bash
bun run lint       # biome check .
bun run test       # bun test (1536 unit tests, pure logic only)
bun run typecheck  # tsc --noEmit across all workspaces
bun run release <semver>  # bump versions, tag, push (see scripts/release.ts)
```

## Configuration

Runtime data lives in `~/.harnesys` (`config.json`, `org.db`, `master.key`, `nodes/`). The API uses `Authorization: Bearer <token>` and the `X-Org-Id` header; `GET /api/health` is public. Key variables (full list in `.env.example`): `SERVER_HOST`, `SERVER_PORT`, `HARNESYS_HOME`, `HARNESYS_MASTER_KEY`, `PUBLIC_URL`, `HARNESYS_GOOGLE_*` (Drive OAuth + Picker).

Live updates are push-only: SSE for run events, watches, and LSP diagnostics; WebSockets for fleet workers and terminals. No polling.

## License

[PolyForm Internal Use 1.0.0](LICENSE) — use and modify freely inside your organization, including for commercial purposes. Redistribution of the software or derivative works is not permitted.

Issues are welcome. Pull requests are not accepted and will be closed.
