// YoonSpace - A lightweight browser for Engineers
// Copyright (C) 2026 Kana Wesley Yamada
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use crate::core::config::{
    get_saved_media_volume, load_config, save_config, set_saved_media_volume, AppConfig,
};

#[tauri::command]
pub fn get_app_config() -> AppConfig {
    load_config()
}

#[tauri::command]
pub fn update_app_config(mut config: AppConfig) -> Result<(), String> {
    config.media_volume = get_saved_media_volume();
    save_config(&config)
}

#[tauri::command]
pub fn set_media_volume(volume: u8, persist: bool) -> Result<(), String> {
    set_saved_media_volume(volume, persist)
}

#[tauri::command]
pub async fn get_search_suggestions(query: String, engine_id: String) -> Vec<String> {
    let trimmed = query.trim().to_string();
    if trimmed.is_empty() || trimmed.len() > 200 {
        return Vec::new();
    }

    tauri::async_runtime::spawn_blocking(move || {
        let encoded: String = url::form_urlencoded::byte_serialize(trimmed.as_bytes()).collect();
        let endpoint = match engine_id.as_str() {
            "duckduckgo" => format!("https://duckduckgo.com/ac/?q={}&type=list", encoded),
            "brave" => format!("https://search.brave.com/api/suggest?q={}", encoded),
            _ => format!(
                "https://suggestqueries.google.com/complete/search?client=firefox&q={}",
                encoded
            ),
        };

        let output = match std::process::Command::new("curl")
            .args([
                "-fsSL",
                "--max-time",
                "2",
                "--connect-timeout",
                "1",
                "-A",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                &endpoint,
            ])
            .output()
        {
            Ok(out) if out.status.success() => out,
            _ => return Vec::new(),
        };

        let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
            return Vec::new();
        };

        let Some(arr) = json.as_array().and_then(|root| root.get(1)).and_then(|v| v.as_array()) else {
            return Vec::new();
        };

        arr.iter()
            .filter_map(|item| item.as_str().map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
            .take(6)
            .collect()
    })
    .await
    .unwrap_or_default()
}
