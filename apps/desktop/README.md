# @harnesys/desktop

Tauri v2 desktop shell for Harnesys (macOS, Windows, Linux). No frontend of its own: dev and production both load the SPA from `apps/webui`. The host API ships inside the app as a `harnesys-host` sidecar — on start it binds `127.0.0.1:47474`; if the port is already served (dev server or CLI-managed host), it reuses the running instance. The sidecar is stopped on exit.

## Quick start

```bash
bun run dev:desktop      # from the root: host from sources + vite + Tauri window
bun run build:desktop    # production bundles
bun run icon:desktop     # regenerate icons (scripts/icons-desktop.sh)
```

Direct commands from `apps/desktop`: `bunx tauri dev`, `bunx tauri build`, `bunx tauri build --bundles dmg`.

## How it works

- **WebUI** — `tauri.conf.json` wires dev (`beforeDevCommand` + `devUrl :5173`) and build (`beforeBuildCommand` + `frontendDist` pointing at the webui build).
- **Host sidecar** (`src-tauri/src/lib.rs`) — TCP-probes `127.0.0.1:47474` (300 ms), reuses a live host or spawns the bundled binary, waits up to 10 s for health, then shows the window. Vendor Google credentials (`HARNESYS_GOOGLE_CLIENT_ID`, `HARNESYS_GOOGLE_API_KEY`, `HARNESYS_GOOGLE_APP_ID`) are compiled in via `option_env!` and passed to the sidecar as env.
- **Window & tray** — single `main` window (1280×800, hidden until the host answers), close-to-tray, macOS reopen shows the window; tray menu: open, toggle dev tools, quit, theme-aware icon.
- **Updater** — Tauri updater plugin with `latest.json` from GitHub releases (`releases/latest/download/latest.json`), minisign signatures, `stop_host` command so the NSIS installer can replace the running binary.

## Build pipeline

`bun run build:desktop` (`scripts/build-desktop.ts`):

1. Loads the updater signing key from `TAURI_SIGNING_PRIVATE_KEY` or `keys/updater.key`.
2. Builds the host binary for the active Rust target (`bun build --compile`) and stages it into `src-tauri/binaries/`.
3. Runs `tauri build` per platform: `dmg` + `app` (macOS), `nsis` (Windows), `appimage` + `deb` (Linux).

Versions across `package.json`, `tauri.conf.json`, `Cargo.toml`/`Cargo.lock`, and the other apps are bumped by `scripts/release.ts`.

Release builds read the vendor Google variables from the environment at compile time — export them before building (never commit them):

```bash
export HARNESYS_GOOGLE_CLIENT_ID=... HARNESYS_GOOGLE_API_KEY=... HARNESYS_GOOGLE_APP_ID=...
bun run build:desktop
```

Without them the app starts fine; Drive flows report a clear missing-configuration error.

## Limitations

- The host port is hard-coded to `127.0.0.1:47474` — no env override.
- Dev health-wait hits `/health/live` (Brix core), while CLI probes use `/api/health` — both exist, do not mix them up.

## Layout

```
apps/desktop/
  src-tauri/
    src/main.rs        # entry -> desktop_lib::run()
    src/lib.rs         # window, tray, sidecar, updater, stop_host
    tauri.conf.json
    Cargo.toml / build.rs
    capabilities/default.json
    icons/             # app + tray icons
    binaries/.gitignore
```

No JS dependencies of its own (`@tauri-apps/cli` only).
