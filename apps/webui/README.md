# @harnesys/webui

The Harnesys client SPA: desk with chats, per-project IDE, inbox, issues, files, git, terminals, agents, models, and organization settings.

Stack: Vite 8, React 19 with React Compiler (`babel-plugin-react-compiler`), shadcn `base-nova` + Tailwind 4, React Router, TanStack Query 5, Zustand, Monaco, xterm. The backend is the host API only — the frontend is thin, with no adapter layers.

## Quick start

```bash
bun install                    # from the repository root
bun run dev:webui              # vite on :5173, proxies /api -> 127.0.0.1:47474
```

A live host API is required. Production:

```bash
bun run build:client           # tsc -b && vite build -> dist/
bun apps/webui/server/index.ts # Bun + Hono: /healthz, /api proxy, static dist
```

The production server listens on `:8080` and proxies to `http://127.0.0.1:47474`. Docker: `deploy/web.Dockerfile`; deployment guide: `deploy/DOKPLOY.md`.

## Layout

```
src/
  app/       # routes, router, providers, session gate
  pages/     # project / inbox / settings / desk entries
  entities/  # per-domain models + api clients (agent, issue, thread, ...)
  features/  # feature modules (manage-*, ide, desk, send-message, ...)
  widgets/   # chat composer/transcript, IDE panes, terminal, sidebar, inspector
  shared/    # api clients (client.ts, sse.ts, events.ts), config, lib, UI kit
server/      # production server (index, app, config, static)
```

## API and realtime

- Session: login form before org bootstrap; `Authorization: Bearer <accessToken>` kept in memory only, `X-Org-Id` per request; on `401 SESSION_EXPIRED` the refresh cookie flow replays the request once.
- Live updates are push-only: SSE for `/api/events/watch`, thread run streams, compaction, LSP diagnostics; WebSocket terminals with one-time tickets. No polling anywhere — a one-off fetch on action/mount only.
- TanStack Query: `staleTime 30s`, `retry 0`, `refetchOnWindowFocus false`.

## Theming

Dark by default, `system|light|dark` plus UI scale and accent color, stored in `localStorage` (`harnesys.appearance`), hotkey `d` toggles the theme. Fonts: IBM Plex Sans Variable + IBM Plex Mono. No i18n.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DEV_SERVER_PORT` | `5173` | dev server port |
| `CLIENT_HOST_ORIGIN` | page origin (`127.0.0.1:47474` in Tauri) | host API origin |
| `HARNESYS_WEB_PORT` \| `WEB_PORT` | `8080` | production server port |
| `HARNESYS_WEB_STATIC` \| `STATIC_DIR` | `../dist` | SPA directory |
| `HARNESYS_UPSTREAM` \| `UPSTREAM` | `http://127.0.0.1:47474` | host API upstream |

## Development

```bash
bun run --cwd apps/webui typecheck
bun run --cwd apps/webui build
```

React Compiler is enabled — do not add manual `useMemo`/`useCallback` for performance. No e2e/RTL/playwright, no network polling, no `T['field']` types; object shapes are `interface` only.
