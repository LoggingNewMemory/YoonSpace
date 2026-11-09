use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

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
pub struct AppConfig {
    pub active_search_engine: String,
    pub search_engines: Vec<SearchEngine>,
    pub split_presets: Vec<SplitPreset>,
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
        if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
            return cfg;
        }
    }

    let default_cfg = AppConfig::default();
    let _ = save_config(&default_cfg);
    default_cfg
}

pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
