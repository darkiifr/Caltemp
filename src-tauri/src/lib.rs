use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use std::sync::Mutex;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

#[cfg(target_os = "windows")]
use window_vibrancy::{
    apply_acrylic, apply_blur, apply_mica, clear_acrylic, clear_blur, clear_mica,
};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[derive(Default)]
struct DiscordRpcState {
    client: Mutex<Option<DiscordIpcClient>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordPresence {
    client_id: String,
    activity: DiscordActivityPayload,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscordActivityPayload {
    details: String,
    state: String,
    start_timestamp: Option<i64>,
    large_image_key: Option<String>,
    large_image_text: Option<String>,
}

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

#[tauri::command]
fn discord_rpc_update(
    state: tauri::State<'_, DiscordRpcState>,
    presence: DiscordPresence,
) -> Result<(), String> {
    let mut guard = state
        .client
        .lock()
        .map_err(|_| "Discord RPC state is unavailable.".to_string())?;

    if guard.is_none() {
        let mut client = DiscordIpcClient::new(&presence.client_id);
        client.connect().map_err(|error| error.to_string())?;
        *guard = Some(client);
    }

    let mut payload = activity::Activity::new()
        .details(presence.activity.details)
        .state(presence.activity.state);

    if let Some(start) = presence.activity.start_timestamp {
        payload = payload.timestamps(activity::Timestamps::new().start(start));
    }

    if presence.activity.large_image_key.is_some() || presence.activity.large_image_text.is_some() {
        let mut assets = activity::Assets::new();
        if let Some(key) = presence.activity.large_image_key {
            assets = assets.large_image(key);
        }
        if let Some(text) = presence.activity.large_image_text {
            assets = assets.large_text(text);
        }
        payload = payload.assets(assets);
    }

    if let Some(client) = guard.as_mut() {
        client.set_activity(payload).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn discord_rpc_clear(state: tauri::State<'_, DiscordRpcState>) -> Result<(), String> {
    let mut guard = state
        .client
        .lock()
        .map_err(|_| "Discord RPC state is unavailable.".to_string())?;

    if let Some(mut client) = guard.take() {
        let _ = client.close();
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DiscordRpcState::default())
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
            set_window_effect,
            discord_rpc_update,
            discord_rpc_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
