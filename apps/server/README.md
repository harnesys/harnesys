# @harnesys/server

Host API for Harnesys: organizations, fleet relay/worker pairing, sources (git/Google Drive), files, terminals, LLM providers, knowledge/RAG, vault, agents, skills, MCP, LSP, threads/runs, approvals, schedules, webhooks, issues/boards/labels, usage.

Stack: Bun runtime, Hono (HTTP), Brix (DI/modules), Drizzle + SQLite (`bun:sqlite`), Zod, Pino, Croner.

## Quick start

```bash
bun install                    # from the repository root (workspace)
bun run dev:server             # bun --watch src/main.ts
```

- API health: `GET http://127.0.0.1:47474/api/health` → `{"status":"ok"}`
- Brix probes (no `/api` prefix): `GET /health/live`, `GET /health/ready`, `GET /metrics`

Standalone binary: `bun run build:host` → `build/harnesys-host` + `build/assets`.
Docker: `deploy/host.Dockerfile`, `deploy/docker-compose.yml`.

## Architecture

Clean architecture in a Nest-style layout on top of Hono:

```
src/
  main.ts                  # Brix.create(AppModule.forRoot()) -> init -> seed -> WS -> serve
  config.schema.ts         # AppConfigSchema (zod)
  config/application.yml   # environment/app/harnesys/google/server/logging
  app/
    api/rest/              # 77 controller files, thin facades over use-cases
    api/guards/            # HostAuthGuard (global APP_GUARD)
    application/use-cases/ # one class per file, `execute` method
    domain/                # entities, *-port.ts (abstract DI ports), errors
    infra/                 # *.adapter.ts + *.module.ts
```

Request flow: `HostAuthGuard` (Bearer token or `?token=`, `GET /health` public) → `X-Org-Id` org resolution → controller (`@Body`/`@Query` Zod schemas) → use-case → ports → adapters (SQLite/FS/processes).

DI contract: ports are `abstract class` in `domain`, adapters extend them, modules wire them via `providers: [{ provide: Port, useClass: Adapter }]`; tokens must be value-imported (never `import type`) so `design:paramtypes` metadata survives.

## API

All routes live under `/api`. Controller groups (see `src/app/api/rest/`): health, orgs, fleet/discovery, sources (git + Google Drive), content, terminals, providers, knowledge, vault, agents/capabilities/memory, skills, MCP, mode-presets, plugins, LSP, threads (runs, attachments, compaction, files, message queue, raw model requests), approvals, schedules, webhooks, issues/boards/labels, usage, events.

Realtime is push-only: SSE for run events, `/api/events/watch`, LSP diagnostics; WebSockets for fleet workers and terminals. There is no polling anywhere.

Errors follow one contract: `{ statusCode, errorCode, message, path, timestamp, traceId?, details? }`. Zod failures return `400 VALIDATION_ERROR` with `details.issues`; domain errors map to typed codes; unknown errors become `500 INTERNAL_ERROR`.

## Configuration

`src/config/application.yml` with `${VAR:-default}` substitution; secrets come from `apps/server/.env`.

| Variable | Default | Purpose |
|---|---|---|
| `SERVER_HOST` / `SERVER_PORT` | `0.0.0.0` / `47474` | bind address |
| `HARNESYS_HOME` | `~/.harnesys` | machine home: `config.json`, `machine.json`, `orgs/<id>/org.db`, `nodes/` |
| `HARNESYS_MASTER_KEY` | `~/.harnesys/master.key` | master key for the secret store (base64, 32 bytes) |
| `PUBLIC_URL` | — | public origin override |
| `HARNESYS_GOOGLE_CLIENT_ID` / `_SECRET` / `_API_KEY` / `_APP_ID` | — | Google Drive OAuth + Picker |
| `HARNESYS_BUNDLED_ASSETS` | sibling `assets/` | presets and system skills root |

Logs: `logs/app.log` (10 MB × 5 rotation), request log `method path statusCode durationMs traceId`, `x-request-id` echoed.

## Development

```bash
bun test apps/server   # units: *.spec.ts next to the code, pure logic only
bun run typecheck
bun run lint
```

No e2e/HTTP tests. Everything the host serves must live on one volume (`orgs/`, `data/`, `master.key`, `nodes/`) — `deploy/docker-compose.yml` already mounts a single volume.
