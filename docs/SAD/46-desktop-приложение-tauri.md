# 46. Десктоп приложение (apps/desktop, Tauri)

## Обзор

Десктоп приложение на Tauri 2 (Rust), версия 0.8.2 — `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`. Идентификатор: `com.mikestotik.harnesys`. Точка входа Rust: `apps/desktop/src-tauri/src/main.rs` → `desktop_lib::run()` (`lib.rs`). Frontend — WebUI (`apps/webui`), собирается в `apps/webui/dist`; в dev режиме работает на `http://localhost:5173`.

## Архитектура

Tauri-оболочка запускает WebUI внутри вебвью и управляет жизненным циклом bundled хоста.

### Связь с сервером (sidecar → API :47474)

- Адрес хоста: `127.0.0.1:47474` (`HOST_ADDR`, `lib.rs:12`).
- При запуске окна приложение проверяет, не слушает ли уже хост на порту (`host_alive`, TCP connect с таймаутом 300 мс, `lib.rs:34`).
- Если хост не доступен, запускается sidecar `harnesys-host` через `tauri-plugin-shell` (`spawn_host`, `lib.rs:51`):
  - `SERVER_HOST=127.0.0.1`;
  - опциональные Google переменные через `option_env!` (`HARNESYS_GOOGLE_CLIENT_ID`, `HARNESYS_GOOGLE_API_KEY`, `HARNESYS_GOOGLE_APP_ID`) — секрет не bake'ится;
  - опционально `HARNESYS_BUNDLED_ASSETS` (путь к ресурсам `assets` из `apps/server/assets`, если директория существует).
- Ожидание доступности хоста до 10 с с интервалом 200 мс (`wait_host`, `lib.rs:73`).
- После запуска хоста окно показывается (`show_main`).
- Веб встроен в webview Tauri и ходит на локальный хост `:47474` по HTTP (`/api`) + SSE + терминальный WebSocket.
- При закрытии окна оно скрывается, а не завершается (`CloseRequested` → `prevent_close`, `hide`, `lib.rs:210`).
- При выходе из приложения (`RunEvent::Exit`) sidecar убивается (`lib.rs:251`).
- Команда `stop_host` убивает sidecar (для обновления бинарника на Windows NSIS) — `lib.rs:85`.
- Команда `pasteboard_paths` читает буфер обмена macOS через `osascript` (JXA) — `lib.rs:96` (macOS only).

Binaрный хост собирается в `build/harnesys-host` (`package.json` корня, `build:host`) и подключается как `externalBin` (`binaries/harnesys-host`) в `tauri.conf.json:39-41`. Ресурсы `apps/server/assets` подключаются как `assets` — `tauri.conf.json:42-44`.

### Плагины и трей

Плагины: `opener`, `process`, `shell`, `updater` (`lib.rs:204-207`). `invoke_handler`: `stop_host`, `pasteboard_paths` (`lib.rs:208`). Трей с пунктами "Open Harnesys", "Toggle Developer Tools", "Quit Harnesys" (`build_tray`, `lib.rs:160`).

## Сборка

- Dev: `bun run scripts/dev-desktop.ts` — подготавливает бинарник хоста, запускает Bun сервер (`bun --watch src/main.ts` в `apps/server`), ждёт `http://127.0.0.1:47474/health/live` до 5 с (25 × 200 мс), затем `bunx tauri dev` (`devUrl http://localhost:5173`) — `scripts/dev-desktop.ts`, `tauri.conf.json:7-8`.
- Build: `bun run scripts/build-desktop.ts` → `tauri build` (сначала `bun run --cwd ../webui build`) — `scripts/build-desktop.ts`, `tauri.conf.json:9-10`.
- Цели бандлов: `app`, `dmg`, `nsis`, `appimage`, `deb` — `tauri.conf.json:28-34`; `build-desktop.ts` выбирает набор по платформе (darwin → dmg+app, windows → nsis, linux → appimage+deb).
- Минимальная версия macOS: 13.0 — `tauri.conf.json:36`.
- Автообновление через GitHub Releases (`latest.json` с pubkey) — `tauri.conf.json:53-59`. Сборка без апдейт-артефактов, если `TAURI_SIGNING_PRIVATE_KEY` не задан и нет `keys/updater.key`.

Десктоп использует собранный бэкенд сервер (`harnesys-host`) и веб-клиент (`harnesys-web`).

## Связанные разделы

- [47-развёртывание-docker.md](./47-развёртывание-docker.md)
- [41-frontend-архитектура-webui.md](./41-frontend-архитектура-webui.md)
