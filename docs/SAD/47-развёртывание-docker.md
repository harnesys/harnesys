# 47. Развёртывание (Docker)

## Файлы развёртывания

| Файл | Назначение |
|------|------------|
| `deploy/docker-compose.yml` | Хост API + WebUI (сетевой поиск searxng опциональным профилем) |
| `deploy/docker-compose.host.yml` | Только хост API (без WebUI) |
| `deploy/host.Dockerfile` | Dockerfile хоста (Bun, `oven/bun:1-alpine`) |
| `deploy/web.Dockerfile` | Dockerfile WebUI (SPA + `/api` reverse proxy) |
| `deploy/DOKPLOY.md` | Инструкция развёртывания на Dokploy |
| `deploy/searxng/` | Сервис searxng (профиль `search`) |
| `deploy/.env.example` | Пример переменных окружения |

## Docker Compose

### `docker-compose.yml` (хост + веб)

| Сервис | Порт | Healthcheck | Источник |
|--------|------|-------------|----------|
| `host` | 47474 | `fetch http://127.0.0.1:47474/health/live`, interval 10s, timeout 5s, retries 6, start_period 20s | `deploy/docker-compose.yml` |
| `web` | 8080 | `fetch http://127.0.0.1:8080/healthz`, interval 10s, timeout 5s, retries 6, start_period 10s | `deploy/docker-compose.yml` |
| `searxng` | 8888 (профиль `search`) | `wget -qO- http://localhost:8080/healthz`, interval 30s, timeout 10s, retries 3 | `deploy/docker-compose.yml` |

Переменные хоста: `NODE_ENV=production`, `SERVER_HOST=0.0.0.0`, `SERVER_PORT=47474`, `PORT=47474`, `PUBLIC_URL`, `HARNESYS_HOME=/data`, `HARNESYS_MASTER_KEY`, Google device vars — `deploy/docker-compose.yml`.

Переменные веб: `HARNESYS_WEB_PORT=8080`, `HARNESYS_UPSTREAM=http://host:47474`, `HARNESYS_WEB_STATIC=/srv/dist` — `deploy/docker-compose.yml`.

Volumes: именованный volume `harnesys-data` монтируется в `/data` (`HARNESYS_HOME`) — `deploy/docker-compose.yml`.

### `docker-compose.host.yml` (хост только)

Один сервис `host` на порту `${PORT:-47474}:47474`, volume `harnesys-data`. Dokploy: compose file `deploy/docker-compose.host.yml`, домен на сервис `host`, порт 47474.

## Сборка бинарников

| Цель | Команда | Источник |
|------|---------|----------|
| Хост | `bun build --compile apps/server/src/main.ts --outfile build/harnesys-host` + копирование `apps/server/assets` → `build/assets` | `package.json` (`build:host`) |
| Веб | `bun build --compile apps/webui/server/index.ts --outfile build/harnesys-web` | `package.json` (`build:web`) |
| CLI | `bun build --compile apps/cli/src/index.ts --outfile build/harnesys` | `package.json` (`build:cli`) |

Docker-образы собираются из контекста корня репозитория (`build: context: ..`) с тегами `ghcr.io/harnesys/{host,web}` — `deploy/docker-compose.yml`.

## Dokploy

- Хост + WebUI: Docker Compose сервис, compose file `deploy/docker-compose.yml`, домен на сервис `web`, порт 8080. HTTPS включается отдельно. Edge auth (опционально): защита SPA Basic Auth, но `/api` и WebSocket upgrade остаются доступными без Basic Auth — `deploy/DOKPLOY.md`.
- Хост только: compose file `deploy/docker-compose.host.yml`, домен на сервис `host`, порт 47474, нет WebUI, управление через CLI/desktop — `deploy/DOKPLOY.md`.
- Инициализация владельца: `POST /api/session/owner/init` отвечает только с loopback (внутри контейнера host) — `deploy/DOKPLOY.md`.
- Проверки: `curl -sf https://harnesys.example.com/healthz`, `curl -sf https://harnesys.example.com/api/health/live` — `deploy/DOKPLOY.md`.
- Локальный smoke: `docker compose -f deploy/docker-compose.yml up -d --build`, затем `curl` на `http://127.0.0.1:8080/healthz` и `/api/health/live` — `deploy/DOKPLOY.md`.

## Данные

Volume `harnesys-data` на `/data` (`HARNESYS_HOME`). Орг БД, `config.json`, `machine.json`, `master.key` хранятся на этом volume. Не хранить runtime-данные под git checkout Dokploy (стирается при redeploy) — `deploy/DOKPLOY.md`.

## Порты

- API server: `:47474` (`SERVER_PORT`) — `deploy/docker-compose.yml`, `deploy/docker-compose.host.yml`.
- WebUI: `:8080` в контейнере, опубликован как `${WEB_PORT:-8080}:8080` — `deploy/docker-compose.yml`.

## Связанные разделы

- [05-архитектура-сервера.md](./05-архитектура-сервера.md)
- [46-desktop-приложение-tauri.md](./46-desktop-приложение-tauri.md)
