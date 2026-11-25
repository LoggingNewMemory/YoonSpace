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
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::favicon_cache::{get_cached_favicon, normalize_site_url, resolve_site_logo};
use super::user_data::get_user_data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkItem {
    pub id: String,
    pub title: String,
    pub url: String,
    pub icon_url: Option<String>,
    pub icon_data_url: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

static BOOKMARKS_CACHE: Mutex<Option<Vec<BookmarkItem>>> = Mutex::new(None);

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn get_bookmarks_path() -> PathBuf {
    get_user_data_dir().join("bookmarks.json")
}

fn load_bookmarks_raw() -> Vec<BookmarkItem> {
    let mut guard = BOOKMARKS_CACHE.lock().unwrap();
    if let Some(ref list) = *guard {
        return list.clone();
    }

    let path = get_bookmarks_path();
    let loaded = if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Vec<BookmarkItem>>(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    *guard = Some(loaded.clone());
    loaded
}

fn save_bookmarks_raw(list: &[BookmarkItem]) -> Result<(), String> {
    let path = get_bookmarks_path();
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("Failed to write bookmarks temp file: {}", e))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Failed to save bookmarks: {}", e))?;

    let mut guard = BOOKMARKS_CACHE.lock().unwrap();
    *guard = Some(list.to_vec());
    Ok(())
}

fn hydrate_icon_from_cache(item: &mut BookmarkItem) {
    if item
        .icon_data_url
        .as_deref()
        .map(|s| !s.is_empty())
        .unwrap_or(false)
    {
        return;
    }
    if let Some(cached) = get_cached_favicon(&item.url) {
        if !cached.data_url.is_empty() {
            item.icon_data_url = Some(cached.data_url);
            if item.icon_url.is_none() {
                item.icon_url = cached.icon_url;
            }
        }
    }
}

pub fn list_bookmarks() -> Vec<BookmarkItem> {
    let mut list = load_bookmarks_raw();
    for item in &mut list {
        hydrate_icon_from_cache(item);
    }
    list
}

fn derive_fallback_title(url: &url::Url) -> String {
    url.host_str()
        .map(|h| h.trim_start_matches("www.").to_string())
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| url.to_string())
}

pub fn add_bookmark(
    title: Option<String>,
    raw_url: String,
    candidate_icon_url: Option<String>,
) -> Result<BookmarkItem, String> {
    let parsed = normalize_site_url(&raw_url).ok_or_else(|| "Invalid site URL".to_string())?;
    let normalized_url = parsed.to_string();

    let cleaned_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    // Resolve site logo from cache (or detect & cache once)
    let logo = resolve_site_logo(
        &normalized_url,
        candidate_icon_url.as_deref(),
        cleaned_title.as_deref(),
        false,
    )
    .ok();

    let final_title = cleaned_title
        .or_else(|| logo.as_ref().and_then(|l| l.title.clone()))
        .unwrap_or_else(|| derive_fallback_title(&parsed));

    let icon_data_url = logo
        .as_ref()
        .map(|l| l.data_url.clone())
        .filter(|s| !s.is_empty());
    let icon_url = logo
        .as_ref()
        .and_then(|l| l.icon_url.clone())
        .or(candidate_icon_url);

    let now = current_timestamp_ms();
    let mut list = load_bookmarks_raw();

    // If bookmark with exact URL already exists, update it and move to top
    if let Some(pos) = list.iter().position(|b| b.url.eq_ignore_ascii_case(&normalized_url)) {
        let mut existing = list.remove(pos);
        existing.title = final_title;
        if icon_data_url.is_some() {
            existing.icon_data_url = icon_data_url;
        }
        if icon_url.is_some() {
            existing.icon_url = icon_url;
        }
        existing.updated_at = now;
        list.insert(0, existing.clone());
        save_bookmarks_raw(&list)?;
        return Ok(existing);
    }

    let item = BookmarkItem {
        id: format!("bm_{}", now),
        title: final_title,
        url: normalized_url,
        icon_url,
        icon_data_url,
        created_at: now,
        updated_at: now,
    };

    list.insert(0, item.clone());
    save_bookmarks_raw(&list)?;
    Ok(item)
}

pub fn update_bookmark(
    id: String,
    title: Option<String>,
    raw_url: String,
    refresh_icon: bool,
) -> Result<BookmarkItem, String> {
    let parsed = normalize_site_url(&raw_url).ok_or_else(|| "Invalid site URL".to_string())?;
    let normalized_url = parsed.to_string();
    let cleaned_title = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    let mut list = load_bookmarks_raw();
    let idx = list
        .iter()
        .position(|b| b.id == id)
        .ok_or_else(|| "Bookmark not found".to_string())?;

    let url_changed = !list[idx].url.eq_ignore_ascii_case(&normalized_url);
    let needs_icon = refresh_icon || url_changed || list[idx].icon_data_url.is_none();

    let logo = if needs_icon {
        resolve_site_logo(
            &normalized_url,
            None,
            cleaned_title.as_deref(),
            refresh_icon,
        )
        .ok()
    } else {
        None
    };

    let item = &mut list[idx];
    item.url = normalized_url;
    item.title = cleaned_title
        .or_else(|| logo.as_ref().and_then(|l| l.title.clone()))
        .unwrap_or_else(|| derive_fallback_title(&parsed));
    if let Some(ref l) = logo {
        if !l.data_url.is_empty() {
            item.icon_data_url = Some(l.data_url.clone());
        }
        if l.icon_url.is_some() {
            item.icon_url = l.icon_url.clone();
        }
    }
    item.updated_at = current_timestamp_ms();
    let updated = item.clone();

    save_bookmarks_raw(&list)?;
    Ok(updated)
}

pub fn delete_bookmark(id: String) -> Result<(), String> {
    let mut list = load_bookmarks_raw();
    let before = list.len();
    list.retain(|b| b.id != id);
    if list.len() != before {
        save_bookmarks_raw(&list)?;
    }
    Ok(())
}
