# 64. CLI и десктоп приложение

Краткий раздел (низкий пользовательский интерес). Подробности — в разделах 45 и 46.

## CLI (apps/cli, Bun, type: module)

Точка входа: `apps/cli/src/index.ts` — `parseArgs` диспетчеризует в `HOST_HANDLERS`.

| Команда | Назначение | HTTP / цель |
|---------|------------|-------------|
| `login` | вход пользователя | `POST /api/session/login` |
| `owner-init` | инициализация владельца | `POST /api/session/owner/init` |
| `host-invite` | создание приглашения узла | `POST /api/fleet/invites` (`x-org-id`) |
| `host-enroll` | регистрация узла во флоте | `POST /api/discovery/pair` → `nodes/<orgId>.json` (0600) |
| `host-retarget` | смена релея узла | `POST /api/discovery/retarget` |
| `host-promote` | promote узла (новый релей) | `POST /api/fleet/promote` или `POST /api/discovery/promote/accept` |
| `host-doctor` | диагностика хоста | права 0600, `org.db`, идентичность, `/api/health` |
| `update` | самообновление хоста | GitHub `releases/latest`, ассеты `harnesys-host`/`harnesys-web`, sha256, атомарная замена, `systemctl --user restart` |

Ключевые файлы (`apps/cli/src/`):

- `index.ts` — диспетчер команд; `CliArgs` с флагами `--org/--name/--ttl/--target-node/--relay-url/--from/--token`.
- `session-client.ts` — `fetchWithSession`: `Authorization: Bearer`; на 401 ротация через `POST /api/session/refresh` и один повтор; `failHttp` парсит `{errorCode, message}` тела.
- `session-store.ts` — `session.json` (права 0600) в `~/.harnesys` (`HARNESYS_HOME`): `relayUrl`, `accessToken`, `accessExpiresAt`, `refreshToken`.
- `login.ts` — `POST /api/session/login` → сессия + refresh-куки `harnesys.refresh`.
- `host-enroll.ts` — `POST /api/discovery/pair` (`relayUrl`, `inviteCode`, `nodeName`, `orgId`).
- `host-invite.ts` — `POST /api/fleet/invites` → `code`/`expiresAt`/`relayUrlHint`.
- `host-promote.ts` — `POST /api/fleet/promote` (`targetNodeId`, `newRelayUrl`) → `promoteToken`; или `POST /api/discovery/promote/accept` (`--from/--token`).
- `host-retarget.ts` — `POST /api/discovery/retarget` → обновляет `nodes/<orgId>.json`.
- `host-doctor.ts` — проверка прав 0600 (`config.json`, `machine.json`, `session.json`, `nodes/*.json`), `org.db`, наличие идентичности, пробинг `/api/health`.
- `owner-init.ts` — `POST /api/session/owner/init`.
- `update.ts` — GitHub `releases/latest`, ассеты darwin/linux × x64/arm64, проверка sha256, staging+`rename`, `systemctl --user restart harnesys-host harnesys-web`.
- `paths.ts` — `localOrigin()` из `config.json` (`host.publicOrigin` или `http://host.listen`), по умолчанию `http://127.0.0.1:47474`.

CLI используется для администрирования хоста: регистрация узлов во флоте, вход пользователя, инициализация владельца, диагностика хоста, обновление.

## Десктоп (apps/desktop, Tauri 2 + Rust)

Конфигурация: `apps/desktop/src-tauri/tauri.conf.json`:

- `identifier com.mikestotik.harnesys`
- `beforeDevCommand bun run --cwd ../webui dev`, `devUrl http://localhost:5173`
- `beforeBuildCommand bun run --cwd ../webui build`, `frontendDist ../../webui/dist`
- бандлы `app/dmg/nsis/appimage/deb`
- `externalBin: binaries/harnesys-host`
- ресурсы `../../server/assets` → `assets`
- плагин updater (GitHub Releases `latest.json`)

`src-tauri/src/main.rs` → `desktop_lib::run()`. `lib.rs`: плагины opener/process/shell/updater; `invoke_handler [stop_host, pasteboard_paths]`; `setup` управляют `HostProcess` (`Mutex<Option<CommandChild>>`), трей; `spawn_host` запускает сайдкар `harnesys-host` на `127.0.0.1:47474`, если порт уже живой (`host_alive`, TCP 300 мс) — не запускает (окно говорит с тем, что есть); ожидание до 10с, затем показ окна; `CloseRequested` → скрытие (не выход); `RunEvent::Exit` → убивает хост. Google-учетные данные через `option_env!` (client id/api key/app id, секрет не bake'ится). `pasteboard_paths` через `osascript` JXA (macOS).

**Взаимодействие:** веб встроен в webview Tauri и ходит на локальный хост `:47474` по HTTP (`/api`) + SSE + терминальный WebSocket; хост — собранный бинарный сервер Hono (`build/harnesys-host`), поставляемый как `externalBin` вместе с веб-дистрибутивом.

## Связанные разделы

- [45-cli-инструмент.md](./45-cli-инструмент.md)
- [46-desktop-приложение-tauri.md](./46-desktop-приложение-tauri.md)
- [51-границы-документации.md](./51-границы-документации.md)
