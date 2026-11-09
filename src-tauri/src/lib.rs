pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_close,
            commands::window::window_is_maximized,
            commands::telemetry::get_telemetry,
            commands::webview::spawn_split,
            commands::webview::update_split_layout,
            commands::webview::navigate_split,
            commands::webview::check_split_active,
            commands::webview::close_split,
            commands::config::get_app_config,
            commands::config::update_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running yoonspace application");
}
