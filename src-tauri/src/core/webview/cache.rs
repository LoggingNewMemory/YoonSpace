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
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageCategoryInfo {
    pub id: String,
    pub label: String,
    pub description: String,
    pub size_bytes: u64,
    pub formatted_size: String,
    pub file_count: u64,
    pub path: String,
    pub clearable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheInfo {
    /// Total bytes across all managed cache & web storage categories (kept as `size_bytes` for compatibility).
    pub size_bytes: u64,
    pub formatted_size: String,
    pub http_cache_bytes: u64,
    pub http_cache_formatted: String,
    pub site_data_bytes: u64,
    pub site_data_formatted: String,
    pub favicon_cache_bytes: u64,
    pub favicon_cache_formatted: String,
    pub shield_cache_bytes: u64,
    pub shield_cache_formatted: String,
    pub cache_dir: String,
    pub cache_limit_mb: u64,
    pub categories: Vec<StorageCategoryInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheClearScope {
    HttpCache,
    SiteData,
    Favicons,
    All,
}

impl CacheClearScope {
    pub fn parse(scope: Option<&str>) -> Self {
        match scope.map(|s| s.trim().to_lowercase()).as_deref() {
            Some("http_cache") | Some("http") | Some("cache") => Self::HttpCache,
            Some("site_data") | Some("site") | Some("storage") => Self::SiteData,
            Some("favicons") | Some("favicon") | Some("icons") => Self::Favicons,
            Some("all") | None => Self::All,
            Some(_) => Self::HttpCache,
        }
    }
}

unsafe extern "C" {
    fn malloc_trim(pad: usize) -> i32;
}

/// Returns the actual base directory used by Tauri/wry's WebKitGTK WebsiteDataManager.
pub fn get_app_webkit_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
            dir.push("com.yoonspace.browser");
            dir
        })
}

/// Returns the legacy/fallback cache directory (~/.cache/yoonspace/WebKitCache).
pub fn get_legacy_webkit_cache_dir() -> PathBuf {
    let mut dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.push("yoonspace");
    dir.push("WebKitCache");
    dir
}

/// Returns the root YoonSpace XDG cache directory (~/.cache/yoonspace).
pub fn get_yoonspace_cache_dir() -> PathBuf {
    let mut dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.push("yoonspace");
    dir
}

fn calculate_dir_stats(path: &Path) -> (u64, u64) {
    let mut total_bytes = 0u64;
    let mut file_count = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_dir() {
                    let (sub_bytes, sub_files) = calculate_dir_stats(&entry.path());
                    total_bytes += sub_bytes;
                    file_count += sub_files;
                } else {
                    total_bytes += meta.len();
                    file_count += 1;
                }
            }
        }
    }
    (total_bytes, file_count)
}

fn calculate_shield_cache_stats(cache_root: &Path) -> (u64, u64) {
    let mut total_bytes = 0u64;
    let mut file_count = 0u64;
    if let Ok(entries) = fs::read_dir(cache_root) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with("shield_engine") {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_bytes += meta.len();
                        file_count += 1;
                    }
                }
            }
        }
    }
    (total_bytes, file_count)
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

pub fn get_cache_info(app: &AppHandle) -> CacheInfo {
    let webkit_base = get_app_webkit_data_dir(app);
    let legacy_cache_dir = get_legacy_webkit_cache_dir();

    // 1. HTTP & Page Asset Cache (WebKitCache inside app_data_dir + any legacy WebKitCache)
    let http_cache_dir = webkit_base.join("WebKitCache");
    let (mut http_bytes, mut http_files) = calculate_dir_stats(&http_cache_dir);
    if legacy_cache_dir.exists() && legacy_cache_dir != http_cache_dir {
        let (leg_bytes, leg_files) = calculate_dir_stats(&legacy_cache_dir);
        http_bytes += leg_bytes;
        http_files += leg_files;
    }

    // 2. Site Data & Web Storage (IndexedDB, LocalStorage, ServiceWorkers, CacheStorage, Storage)
    let site_data_subdirs = [
        "CacheStorage",
        "databases",
        "localstorage",
        "serviceworkers",
        "storage",
        "mediakeys",
        "deviceidhashsalts",
    ];
    let mut site_bytes = 0u64;
    let mut site_files = 0u64;
    for sub in &site_data_subdirs {
        let (b, f) = calculate_dir_stats(&webkit_base.join(sub));
        site_bytes += b;
        site_files += f;
    }
    if let Ok(meta) = fs::metadata(webkit_base.join("hsts-storage.sqlite")) {
        site_bytes += meta.len();
        site_files += 1;
    }

    // 3. Favicon & Site Logo Cache
    let favicon_dir = crate::core::favicon_cache::get_favicon_cache_dir();
    let (favicon_bytes, favicon_files) = calculate_dir_stats(&favicon_dir);

    // 4. Shields Engine Cache (~/.cache/yoonspace/shield_engine*.dat/.meta)
    let yoon_cache_root = get_yoonspace_cache_dir();
    let (shield_bytes, shield_files) = calculate_shield_cache_stats(&yoon_cache_root);

    let total_bytes = http_bytes + site_bytes + favicon_bytes + shield_bytes;

    let categories = vec![
        StorageCategoryInfo {
            id: "http_cache".to_string(),
            label: "Page Assets & Resource Cache".to_string(),
            description: "Cached images, stylesheets, scripts, and HTTP responses for faster page loads.".to_string(),
            size_bytes: http_bytes,
            formatted_size: format_bytes(http_bytes),
            file_count: http_files,
            path: http_cache_dir.to_string_lossy().to_string(),
            clearable: true,
        },
        StorageCategoryInfo {
            id: "site_data".to_string(),
            label: "Site Data & Web Storage".to_string(),
            description: "IndexedDB databases, LocalStorage, Service Workers, and offline CacheStorage.".to_string(),
            size_bytes: site_bytes,
            formatted_size: format_bytes(site_bytes),
            file_count: site_files,
            path: webkit_base.to_string_lossy().to_string(),
            clearable: true,
        },
        StorageCategoryInfo {
            id: "favicons".to_string(),
            label: "Favicon & Site Logo Cache".to_string(),
            description: "Locally cached website icons and metadata for tabs and bookmarks.".to_string(),
            size_bytes: favicon_bytes,
            formatted_size: format_bytes(favicon_bytes),
            file_count: favicon_files,
            path: favicon_dir.to_string_lossy().to_string(),
            clearable: true,
        },
        StorageCategoryInfo {
            id: "shield_cache".to_string(),
            label: "Shields Filter Engine Cache".to_string(),
            description: "Pre-compiled adblock-rust filter binary for instant startup blocking.".to_string(),
            size_bytes: shield_bytes,
            formatted_size: format_bytes(shield_bytes),
            file_count: shield_files,
            path: yoon_cache_root.to_string_lossy().to_string(),
            clearable: false,
        },
    ];

    CacheInfo {
        size_bytes: total_bytes,
        formatted_size: format_bytes(total_bytes),
        http_cache_bytes: http_bytes,
        http_cache_formatted: format_bytes(http_bytes),
        site_data_bytes: site_bytes,
        site_data_formatted: format_bytes(site_bytes),
        favicon_cache_bytes: favicon_bytes,
        favicon_cache_formatted: format_bytes(favicon_bytes),
        shield_cache_bytes: shield_bytes,
        shield_cache_formatted: format_bytes(shield_bytes),
        cache_dir: http_cache_dir.to_string_lossy().to_string(),
        cache_limit_mb: 512,
        categories,
    }
}

fn clear_webkit_website_data(app: &AppHandle, data_types: webkit2gtk::WebsiteDataTypes, clear_context_cache: bool) -> Result<(), String> {
    let (done_tx, done_rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let (scheduled_tx, scheduled_rx) = std::sync::mpsc::channel::<bool>();

    let webviews: Vec<_> = app.webviews().into_values().collect();
    if let Some(wv) = webviews.into_iter().next() {
        let done_tx_cb = done_tx.clone();
        let _ = wv.with_webview(move |platform_wv| {
            use webkit2gtk::{WebContextExt, WebViewExt, WebsiteDataManagerExtManual};
            let inner_wv = platform_wv.inner();

            if clear_context_cache {
                if let Some(ctx) = WebViewExt::context(&inner_wv) {
                    ctx.clear_cache();
                }
            }

            if let Some(dm) = inner_wv.website_data_manager() {
                dm.clear(
                    data_types,
                    gtk::glib::TimeSpan::from_seconds(0),
                    None::<&gtk::gio::Cancellable>,
                    move |res| {
                        let _ = done_tx_cb.send(res.map_err(|e| e.to_string()));
                    },
                );
                let _ = scheduled_tx.send(true);
            } else {
                let _ = scheduled_tx.send(false);
            }
        });

        // Wait briefly for the async GLib callback on this worker thread (never on the main thread).
        if scheduled_rx.recv_timeout(Duration::from_secs(2)).unwrap_or(false) {
            let _ = done_rx.recv_timeout(Duration::from_secs(4));
        }
    }

    Ok(())
}

fn clean_dir_contents(dir: &Path) {
    if !dir.exists() {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let _ = fs::remove_dir_all(&p);
            } else {
                let _ = fs::remove_file(&p);
            }
        }
    }
}

pub fn clear_browser_cache(app: &AppHandle, scope: Option<&str>) -> Result<CacheInfo, String> {
    let parsed_scope = CacheClearScope::parse(scope);
    let webkit_base = get_app_webkit_data_dir(app);

    if matches!(parsed_scope, CacheClearScope::HttpCache | CacheClearScope::All) {
        use webkit2gtk::WebsiteDataTypes;
        let types = WebsiteDataTypes::DISK_CACHE
            | WebsiteDataTypes::MEMORY_CACHE
            | WebsiteDataTypes::OFFLINE_APPLICATION_CACHE;
        clear_webkit_website_data(app, types, true)?;

        clean_dir_contents(&webkit_base.join("WebKitCache"));
        let legacy_dir = get_legacy_webkit_cache_dir();
        if legacy_dir.exists() {
            let _ = fs::remove_dir_all(&legacy_dir);
        }
    }

    if matches!(parsed_scope, CacheClearScope::SiteData | CacheClearScope::All) {
        use webkit2gtk::WebsiteDataTypes;
        let types = WebsiteDataTypes::LOCAL_STORAGE
            | WebsiteDataTypes::SESSION_STORAGE
            | WebsiteDataTypes::INDEXEDDB_DATABASES
            | WebsiteDataTypes::WEBSQL_DATABASES
            | WebsiteDataTypes::SERVICE_WORKER_REGISTRATIONS
            | WebsiteDataTypes::DOM_CACHE;
        clear_webkit_website_data(app, types, false)?;

        for sub in ["CacheStorage", "databases", "localstorage", "serviceworkers", "storage"] {
            clean_dir_contents(&webkit_base.join(sub));
        }
    }

    if matches!(parsed_scope, CacheClearScope::Favicons | CacheClearScope::All) {
        crate::core::favicon_cache::clear_favicon_cache()?;
    }

    // Clean up obsolete shield engine v1/v2 cache files if v3 exists
    if matches!(parsed_scope, CacheClearScope::All) {
        let yoon_cache = get_yoonspace_cache_dir();
        if yoon_cache.join("shield_engine_v3.dat").exists() {
            for old in [
                "shield_engine.dat",
                "shield_engine.meta",
                "shield_engine_v2.dat",
                "shield_engine_v2.meta",
            ] {
                let p = yoon_cache.join(old);
                if p.exists() {
                    let _ = fs::remove_file(p);
                }
            }
        }
    }

    unsafe {
        malloc_trim(0);
    }

    Ok(get_cache_info(app))
}
