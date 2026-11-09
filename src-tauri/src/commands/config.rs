use crate::core::config::{load_config, save_config, AppConfig};

#[tauri::command]
pub fn get_app_config() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn update_app_config(config: AppConfig) -> Result<(), String> {
    save_config(&config)
}
