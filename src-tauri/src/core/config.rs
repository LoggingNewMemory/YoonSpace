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

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use serde::{Deserialize, Serialize};

static SAVED_MEDIA_VOLUME: AtomicU8 = AtomicU8::new(100);
static SAVED_MEDIA_VOLUME_INIT: AtomicBool = AtomicBool::new(false);

fn default_media_volume() -> u8 {
    100
}

fn default_wallpaper_transparency() -> u8 {
    50
}

fn default_wallpaper_order() -> String {
    "randomized".to_string()
}

fn default_wallpaper_interval_secs() -> u64 {
    300
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WallpaperSettings {
    #[serde(default)]
    pub folder_path: String,
    #[serde(default = "default_wallpaper_transparency")]
    pub transparency: u8,
    #[serde(default = "default_wallpaper_order")]
    pub order: String,
    #[serde(default = "default_wallpaper_interval_secs")]
    pub change_interval_secs: u64,
}

impl Default for WallpaperSettings {
    fn default() -> Self {
        Self {
            folder_path: String::new(),
            transparency: default_wallpaper_transparency(),
            order: default_wallpaper_order(),
            change_interval_secs: default_wallpaper_interval_secs(),
        }
    }
}

pub fn get_saved_media_volume() -> u8 {
    if !SAVED_MEDIA_VOLUME_INIT.load(Ordering::SeqCst) {
        let _ = load_config();
    }
    SAVED_MEDIA_VOLUME.load(Ordering::SeqCst).min(100)
}

pub fn set_saved_media_volume(volume: u8, persist: bool) -> Result<(), String> {
    let clamped = volume.min(100);
    SAVED_MEDIA_VOLUME.store(clamped, Ordering::SeqCst);
    SAVED_MEDIA_VOLUME_INIT.store(true, Ordering::SeqCst);
    if persist {
        let mut cfg = load_config();
        cfg.media_volume = clamped;
        save_config(&cfg)?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchEngine {
    pub id: String,
    pub name: String,
    pub query_url: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitPreset {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub left_url: String,
    pub right_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldSettings {
    pub enabled: bool,
    pub block_trackers: bool,
    pub upgrade_https: bool,
    pub aggressive_sandbox: bool,
}

impl Default for ShieldSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            block_trackers: true,
            upgrade_https: true,
            aggressive_sandbox: false,
        }
    }
}

pub fn default_download_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|h| h.join("Downloads"))
                .unwrap_or_else(|| PathBuf::from("Downloads"))
        })
        .to_string_lossy()
        .to_string()
}

/// Resolves a configured download directory string into an absolute `PathBuf`,
/// expanding leading `~` and falling back to `default_download_dir()` when empty.
pub fn resolve_download_dir(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return PathBuf::from(default_download_dir());
    }
    if trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    } else if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DownloadSettings {
    #[serde(default = "default_download_dir")]
    pub download_dir: String,
    #[serde(default)]
    pub ask_where_to_save: bool,
    #[serde(default)]
    pub open_folder_on_complete: bool,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            download_dir: default_download_dir(),
            ask_where_to_save: false,
            open_folder_on_complete: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub active_search_engine: String,
    pub search_engines: Vec<SearchEngine>,
    pub split_presets: Vec<SplitPreset>,
    #[serde(default)]
    pub shield_settings: ShieldSettings,
    #[serde(default)]
    pub download_settings: DownloadSettings,
    #[serde(default)]
    pub wallpaper_settings: WallpaperSettings,
    #[serde(default = "default_media_volume")]
    pub media_volume: u8,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            active_search_engine: "google".to_string(),
            search_engines: vec![
                SearchEngine {
                    id: "google".to_string(),
                    name: "Google".to_string(),
                    query_url: "https://www.google.com/search?q=".to_string(),
                    icon: "travel_explore".to_string(),
                },
                SearchEngine {
                    id: "duckduckgo".to_string(),
                    name: "DuckDuckGo".to_string(),
                    query_url: "https://duckduckgo.com/?q=".to_string(),
                    icon: "search".to_string(),
                },
                SearchEngine {
                    id: "brave".to_string(),
                    name: "Brave Search".to_string(),
                    query_url: "https://search.brave.com/search?q=".to_string(),
                    icon: "shield".to_string(),
                },
            ],
            split_presets: vec![
                SplitPreset {
                    id: "gemini_notebook".to_string(),
                    title: "Gemini | NotebookLM".to_string(),
                    icon: "view_column".to_string(),
                    left_url: "https://gemini.google.com".to_string(),
                    right_url: "https://notebooklm.google.com".to_string(),
                },
                SplitPreset {
                    id: "github_jira".to_string(),
                    title: "GitHub | JIRA".to_string(),
                    icon: "troubleshoot".to_string(),
                    left_url: "https://github.com".to_string(),
                    right_url: "https://www.atlassian.com/software/jira".to_string(),
                },
                SplitPreset {
                    id: "claude_youtube".to_string(),
                    title: "Claude | YouTube".to_string(),
                    icon: "school".to_string(),
                    left_url: "https://claude.ai".to_string(),
                    right_url: "https://www.youtube.com".to_string(),
                },
            ],
            shield_settings: ShieldSettings::default(),
            download_settings: DownloadSettings::default(),
            wallpaper_settings: WallpaperSettings::default(),
            media_volume: default_media_volume(),
        }
    }
}

pub fn get_config_path() -> PathBuf {
    if let Some(config_dir) = dirs::config_dir() {
        let app_dir = config_dir.join("yoonspace");
        let _ = fs::create_dir_all(&app_dir);
        app_dir.join("settings.json")
    } else {
        PathBuf::from("settings.json")
    }
}

pub fn load_config() -> AppConfig {
    let path = get_config_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(mut cfg) = serde_json::from_str::<AppConfig>(&content) {
            let mut merged = false;
            for default_engine in AppConfig::default().search_engines {
                if !cfg.search_engines.iter().any(|e| e.id == default_engine.id) {
                    cfg.search_engines.push(default_engine);
                    merged = true;
                }
            }
            cfg.media_volume = cfg.media_volume.min(100);
            SAVED_MEDIA_VOLUME.store(cfg.media_volume, Ordering::SeqCst);
            SAVED_MEDIA_VOLUME_INIT.store(true, Ordering::SeqCst);
            if merged {
                let _ = save_config(&cfg);
            }
            return cfg;
        }
    }

    let default_cfg = AppConfig::default();
    SAVED_MEDIA_VOLUME.store(default_cfg.media_volume.min(100), Ordering::SeqCst);
    SAVED_MEDIA_VOLUME_INIT.store(true, Ordering::SeqCst);
    let _ = save_config(&default_cfg);
    default_cfg
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let mut sanitized = config.clone();
    sanitized.media_volume = sanitized.media_volume.min(100);
    SAVED_MEDIA_VOLUME.store(sanitized.media_volume, Ordering::SeqCst);
    SAVED_MEDIA_VOLUME_INIT.store(true, Ordering::SeqCst);
    let path = get_config_path();
    let json = serde_json::to_string_pretty(&sanitized).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
