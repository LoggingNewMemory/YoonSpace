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

use crate::core::bookmarks::{
    add_bookmark as core_add_bookmark,
    delete_bookmark as core_delete_bookmark,
    list_bookmarks as core_list_bookmarks,
    update_bookmark as core_update_bookmark,
    BookmarkItem,
};
use crate::core::favicon_cache::{
    clear_favicon_cache as core_clear_favicon_cache,
    get_cached_favicon as core_get_cached_favicon,
    resolve_site_logo as core_resolve_site_logo,
    ResolvedSiteLogo,
};

#[tauri::command]
pub async fn list_bookmarks() -> Result<Vec<BookmarkItem>, String> {
    tauri::async_runtime::spawn_blocking(core_list_bookmarks)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_bookmark(
    title: Option<String>,
    url: String,
    candidate_icon_url: Option<String>,
) -> Result<BookmarkItem, String> {
    tauri::async_runtime::spawn_blocking(move || core_add_bookmark(title, url, candidate_icon_url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_bookmark(
    id: String,
    title: Option<String>,
    url: String,
    refresh_icon: Option<bool>,
) -> Result<BookmarkItem, String> {
    let refresh = refresh_icon.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || core_update_bookmark(id, title, url, refresh))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn delete_bookmark(id: String) -> Result<(), String> {
    core_delete_bookmark(id)
}

#[tauri::command]
pub fn get_cached_favicon(url: String) -> Option<ResolvedSiteLogo> {
    core_get_cached_favicon(&url)
}

#[tauri::command]
pub async fn resolve_site_logo(
    url: String,
    candidate_icon_url: Option<String>,
    title: Option<String>,
    force_refresh: Option<bool>,
) -> Result<ResolvedSiteLogo, String> {
    let refresh = force_refresh.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        core_resolve_site_logo(
            &url,
            candidate_icon_url.as_deref(),
            title.as_deref(),
            refresh,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn clear_favicon_cache() -> Result<(), String> {
    core_clear_favicon_cache()
}
