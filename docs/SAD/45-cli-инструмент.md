# 45. CLI инструмент (apps/cli)

## Обзор

CLI на Bun (`type: module`), версия 0.8.2 — `apps/cli/package.json`. Точка входа: `apps/cli/src/index.ts`. Скомпилированный бинарник: `build/harnesys` — скрипт `build:cli` в корневом `package.json` (`bun build --compile apps/cli/src/index.ts --outfile build/harnesys`).

## Команды

| Команда | Назначение |
|---------|------------|
| `harnesys help` | справка |
| `harnesys --version` | версия (`CLI_VERSION` из `package.json`) |
| `harnesys login <relayUrl>` | вход пользователя (`POST /api/session/login`) |
| `harnesys owner init` | инициализация владельца (`POST /api/session/owner/init`) |
| `harnesys host invite --org <orgId> --name <nodeName> [--ttl 15]` | создание приглашения узла (`POST /api/fleet/invites`) |
| `harnesys host enroll <relayUrl> <code> --org <orgId> --name <nodeName>` | регистрация узла во флоте (`POST /api/discovery/pair`) |
| `harnesys host retarget --org <orgId> <newRelayUrl>` | смена релея узла (`POST /api/discovery/retarget`) |
| `harnesys host promote --org <orgId> --target-node <nodeId> --relay-url <url>` | promote узла (`POST /api/fleet/promote`) |
| `harnesys host promote --org <orgId> --accept --from <url> --token <token>` | принятие promote (`POST /api/discovery/promote/accept`) |
| `harnesys host doctor` | диагностика хоста (права 0600, `org.db`, идентичность, `/api/health`) |
| `harnesys update [--repo <owner/name>]` | самообновление хоста (GitHub `releases/latest`, sha256, атомарная замена) |

Диспетчеризация команд — `parseArgs` → `HOST_HANDLERS` в `apps/cli/src/index.ts`. Флаги: `--org`, `--name`, `--ttl`, `--target-node`, `--relay-url`, `--from`, `--token`, `--accept`.

Ключевые файлы (`apps/cli/src/`):

- `session-client.ts` — `fetchWithSession`: заголовок `Authorization: Bearer`; при 401 ротация через `POST /api/session/refresh` и один повтор; `failHttp` парсит `{errorCode, message}` тела.
- `session-store.ts` — `session.json` (права 0600) в `~/.harnesys` (`HARNESYS_HOME`): `relayUrl`, `accessToken`, `accessExpiresAt`, `refreshToken`.
- `login.ts` — `POST /api/session/login` → сессия + refresh-куки `harnesys.refresh`.
- `host-enroll.ts` — `POST /api/discovery/pair` (`relayUrl`, `inviteCode`, `nodeName`, `orgId`).
- `host-invite.ts` — `POST /api/fleet/invites` → `code`, `expiresAt`, `relayUrlHint`.
- `host-promote.ts` — `POST /api/fleet/promote` (`targetNodeId`, `newRelayUrl`) → `promoteToken`; или `POST /api/discovery/promote/accept` (`--from/--token`).
- `host-retarget.ts` — `POST /api/discovery/retarget` → обновляет `nodes/<orgId>.json`.
- `host-doctor.ts` — проверка прав 0600 (`config.json`, `machine.json`, `session.json`, `nodes/*.json`), `org.db`, наличие идентичности, пробинг `/api/health`.
- `owner-init.ts` — `POST /api/session/owner/init`.
- `update.ts` — GitHub `releases/latest`, ассеты darwin/linux × x64/arm64, проверка sha256, staging+`rename`, `systemctl --user restart harnesys-host harnesys-web`.
- `paths.ts` — `localOrigin()` из `config.json` (`host.publicOrigin` или `http://host.listen`), по умолчанию `http://127.0.0.1:47474`.
- `prompt.ts` — интерактивный ввод.

Тесты: `cli.spec.ts`, `host-doctor.spec.ts`, `update.spec.ts` — `apps/cli/src/`.

## Связанные разделы

- [28-флот-узлы-fleet.md](./28-флот-узлы-fleet.md)
- [13-org-и-идентичность.md](./13-org-и-идентичность.md)
