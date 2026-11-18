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
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheInfo {
    pub size_bytes: u64,
    pub formatted_size: String,
}

unsafe extern "C" {
    fn malloc_trim(pad: usize) -> i32;
}

pub fn get_webkit_cache_dir() -> PathBuf {
    let mut dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.push("yoonspace");
    dir.push("WebKitCache");
    dir
}

fn calculate_dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    total += calculate_dir_size(&entry.path());
                } else {
                    total += meta.len();
                }
            }
        }
    }
    total
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn get_cache_info() -> CacheInfo {
    let cache_dir = get_webkit_cache_dir();
    let size_bytes = calculate_dir_size(&cache_dir);
    CacheInfo {
        size_bytes,
        formatted_size: format_bytes(size_bytes),
    }
}

pub fn clear_browser_cache(app: &AppHandle) -> Result<CacheInfo, String> {
    let (tx, rx) = std::sync::mpsc::channel();

    app.run_on_main_thread(move || {
        use webkit2gtk::WebContextExt;
        if let Some(context) = webkit2gtk::WebContext::default() {
            context.clear_cache();
        }
        let _ = tx.send(());
    }).map_err(|e| e.to_string())?;

    let _ = rx.recv();

    let cache_dir = get_webkit_cache_dir();
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
        let _ = fs::create_dir_all(&cache_dir);
    }

    unsafe {
        malloc_trim(0);
    }

    Ok(get_cache_info())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_bytes() {
        assert_eq!(format_bytes(500), "500 B");
        assert_eq!(format_bytes(1024), "1.0 KB");
        assert_eq!(format_bytes(1024 * 1024), "1.0 MB");
        assert_eq!(format_bytes(5 * 1024 * 1024 * 1024), "5.00 GB");
    }

    #[test]
    fn test_get_webkit_cache_dir() {
        let dir = get_webkit_cache_dir();
        assert!(dir.to_str().unwrap().contains("WebKitCache"));
    }

    #[test]
    fn test_get_cache_info() {
        let info = get_cache_info();
        assert!(!info.formatted_size.is_empty());
    }
}
