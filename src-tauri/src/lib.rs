use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::webview::Color;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
use window_vibrancy::{
    apply_acrylic, apply_blur, apply_mica, clear_acrylic, clear_blur, clear_mica,
};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[tauri::command]
fn set_window_effect(window: tauri::WebviewWindow, effect: &str) {
    #[cfg(target_os = "windows")]
    {
        let _ = clear_blur(&window);
        let _ = clear_acrylic(&window);
        let _ = clear_mica(&window);

        match effect {
            "blur" => {
                let _ = apply_blur(&window, Some((18, 18, 18, 200)));
            }
            "acrylic" => {
                let _ = apply_acrylic(&window, Some((18, 18, 18, 200)));
            }
            "mica" => {
                let _ = apply_mica(&window, None);
            }
            _ => {}
        }
    }
    #[cfg(target_os = "macos")]
    {
        let material = match effect {
            "hud" => Some(NSVisualEffectMaterial::HudWindow),
            "popover" => Some(NSVisualEffectMaterial::Popover),
            "sidebar" => Some(NSVisualEffectMaterial::Sidebar),
            "under_window" => Some(NSVisualEffectMaterial::UnderWindowBackground),
            _ => None,
        };
        if let Some(m) = material {
            let _ = apply_vibrancy(&window, m, None, None);
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const PORTABLE_FILES: [&str; 2] = ["events.json", "settings.json"];

fn is_allowed_portable_file(file_name: &str) -> bool {
    PORTABLE_FILES.contains(&file_name)
}

fn portable_mode_enabled() -> bool {
    std::env::var("CALTEMP_PORTABLE")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
        || std::env::args().any(|arg| arg == "--portable")
}

fn portable_data_dir() -> Result<std::path::PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|error| error.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Impossible de trouver le dossier de l'application portable".to_string())?;
    Ok(exe_dir.join("data"))
}

#[tauri::command]
fn is_portable_mode() -> bool {
    portable_mode_enabled()
}

#[tauri::command]
fn read_portable_data_file(file_name: String) -> Result<Option<String>, String> {
    if !is_allowed_portable_file(&file_name) {
        return Err("Fichier portable non autorisé".to_string());
    }

    let path = portable_data_dir()?.join(file_name);
    if !path.exists() {
        return Ok(None);
    }

    std::fs::read_to_string(path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_portable_data_file(file_name: String, content: String) -> Result<(), String> {
    if !is_allowed_portable_file(&file_name) {
        return Err("Fichier portable non autorisé".to_string());
    }

    let dir = portable_data_dir()?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    std::fs::write(dir.join(file_name), content).map_err(|error| error.to_string())
}

#[tauri::command]
fn toggle_mini_calendar(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini-calendar") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|error| error.to_string())?;
        } else {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "mini-calendar",
        WebviewUrl::App("/?mini=1#mini-calendar".into()),
    )
    .title("Caltemp mini")
    .inner_size(320.0, 520.0)
    .resizable(false)
    .decorations(false)
    .transparent(false)
    .background_color(Color(16, 16, 16, 255))
    .always_on_top(true)
    .build()
    .map_err(|error| error.to_string())?;

    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_mini_calendar_always_on_top(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini-calendar") {
        window
            .set_always_on_top(enabled)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_app::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Default effect
            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");

            #[cfg(target_os = "windows")]
            let _ = apply_mica(&window, None);

            let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Afficher", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .icon(app.default_window_icon().unwrap().clone())
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            is_portable_mode,
            read_portable_data_file,
            write_portable_data_file,
            set_window_effect,
            toggle_mini_calendar,
            set_mini_calendar_always_on_top
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
