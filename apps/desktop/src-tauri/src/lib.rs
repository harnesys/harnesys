use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, Theme, UserAttentionType, WindowEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const HOST_ADDR: SocketAddr = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 47474));

/// Vendor Google credentials baked at release-build time via `option_env!`.
/// Desktop OAuth client id plus Picker key/project number; no secret is baked
/// (loopback flow uses a public Desktop client). Dev builds set nothing and
/// Drive flows report missing config.
/// Values come from release-machine env (CI secrets) and are never committed.
const VENDOR_GOOGLE_ENV: [(&str, Option<&str>); 3] = [
    (
        "HARNESYS_GOOGLE_CLIENT_ID",
        option_env!("HARNESYS_GOOGLE_CLIENT_ID"),
    ),
    (
        "HARNESYS_GOOGLE_API_KEY",
        option_env!("HARNESYS_GOOGLE_API_KEY"),
    ),
    (
        "HARNESYS_GOOGLE_APP_ID",
        option_env!("HARNESYS_GOOGLE_APP_ID"),
    ),
];

fn host_alive() -> bool {
    TcpStream::connect_timeout(&HOST_ADDR, Duration::from_millis(300)).is_ok()
}

struct HostProcess(Mutex<Option<CommandChild>>);

/// Bundled skills/presets live in the resource dir for packaged builds
/// (`Contents/Resources/assets`). Returned only when it actually exists —
/// in dev builds the resource dir holds no assets and the host falls back
/// to its own resolution.
fn bundled_assets_env(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("assets");
    dir.is_dir().then_some(dir)
}

/// Spawn the bundled host sidecar unless a host already listens on the port
/// (dev server or CLI-managed host — the window talks to whichever is there).
fn spawn_host(app: &AppHandle) -> Result<(), String> {
    if host_alive() {
        return Ok(());
    }
    let mut command = app
        .shell()
        .sidecar("harnesys-host")
        .map_err(|e| e.to_string())?
        .env("SERVER_HOST", "127.0.0.1");
    for (key, value) in VENDOR_GOOGLE_ENV {
        if let Some(v) = value.filter(|v| !v.is_empty()) {
            command = command.env(key, v);
        }
    }
    if let Some(dir) = bundled_assets_env(app) {
        command = command.env("HARNESYS_BUNDLED_ASSETS", dir.to_string_lossy().to_string());
    }
    let (_rx, child) = command.spawn().map_err(|e| e.to_string())?;
    app.state::<HostProcess>().0.lock().unwrap().replace(child);
    Ok(())
}

fn wait_host(timeout_ms: u64) -> bool {
    for _ in 0..(timeout_ms / 200) {
        if host_alive() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    host_alive()
}

/// Kill the host sidecar so the updater can replace its binary (Windows NSIS).
#[tauri::command]
fn stop_host(app: AppHandle) {
    if let Some(child) = app.state::<HostProcess>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

/// POSIX paths of the files/folders currently on the system clipboard
/// (e.g. copied in Finder). Reads NSPasteboard through osascript/JXA so no
/// extra crates are needed. macOS only; other platforms return an empty
/// list and the UI falls back to the webview paste event.
#[tauri::command]
async fn pasteboard_paths() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        const SCRIPT: &str = concat!(
            "ObjC.import(\"Cocoa\");",
            " var pb = $.NSPasteboard.generalPasteboard;",
            " var urls = pb.readObjectsForClassesOptions($.NSArray.arrayWithObject($.NSURL), $());",
            " if (urls.isNil()) { \"\" } else {",
            "   ObjC.unwrap(urls).map(function (u) { return ObjC.unwrap(u.path); }).join(\"\\n\")",
            " }",
        );
        let Ok(output) = Command::new("osascript")
            .args(["-l", "JavaScript", "-e", SCRIPT])
            .output()
        else {
            return vec![];
        };
        if !output.status.success() {
            return vec![];
        }
        return String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect();
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![]
    }
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

const TRAY_BLACK: &[u8] = include_bytes!("../icons/tray-black.png");
const TRAY_WHITE: &[u8] = include_bytes!("../icons/tray-white.png");

fn tray_icon(theme: Option<Theme>) -> tauri::image::Image<'static> {
    let bytes = if matches!(theme, Some(Theme::Dark)) {
        TRAY_WHITE
    } else {
        TRAY_BLACK
    };
    tauri::image::Image::from_bytes(bytes).expect("tray icon")
}

fn toggle_devtools(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Harnesys", true, None::<&str>)?;
    let devtools = MenuItem::with_id(
        app,
        "devtools",
        "Toggle Developer Tools",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Harnesys", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &devtools, &quit])?;
    let theme = app.get_webview_window("main").and_then(|w| w.theme().ok());
    let builder = TrayIconBuilder::with_id("main")
        .icon(tray_icon(theme))
        .tooltip("Harnesys")
        .menu(&menu)
        .show_menu_on_left_click(false);
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "devtools" => toggle_devtools(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![stop_host, pasteboard_paths])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::ThemeChanged(theme) => {
                if let Some(tray) = window.app_handle().tray_by_id("main") {
                    let _ = tray.set_icon(Some(tray_icon(Some(theme.clone()))));
                }
            }
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(HostProcess(Mutex::new(None)));
            build_tray(&handle)?;

            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.request_user_attention(Some(UserAttentionType::Critical));
            }
            if let Err(e) = spawn_host(&handle) {
                eprintln!("host sidecar: {e}");
            }
            std::thread::spawn(move || {
                wait_host(10_000);
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || show_main(&h));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // macOS dock icon click while the window is hidden.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main(app),
            RunEvent::Exit => {
                if let Some(child) = app.state::<HostProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        });
}
