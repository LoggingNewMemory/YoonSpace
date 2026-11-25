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

use tauri::AppHandle;
use crate::core::webview::{
    clear_browser_cache as core_clear_browser_cache, close_split_views, close_tab_view,
    get_cache_info as core_get_cache_info, hide_all_webviews, is_split_active,
    navigate_split_view, navigate_tab_view, set_split_ratio as core_set_split_ratio,
    spawn_single_view as core_spawn_single_view, spawn_split_views, update_split_bounds,
    webview_go_back as core_webview_go_back, webview_go_forward as core_webview_go_forward,
    webview_reload as core_webview_reload, CacheInfo, SingleViewRequest, SplitBounds,
    SplitViewRequest,
};

#[tauri::command]
pub fn spawn_single_view(app: AppHandle, req: SingleViewRequest) -> Result<(), String> {
    core_spawn_single_view(&app, req)
}

#[tauri::command]
pub fn spawn_split(app: AppHandle, req: SplitViewRequest) -> Result<(), String> {
    spawn_split_views(&app, req)
}

#[tauri::command]
pub fn update_split_layout(app: AppHandle, bounds: SplitBounds) -> Result<(), String> {
    update_split_bounds(&app, bounds)
}

#[tauri::command]
pub fn set_split_ratio(app: AppHandle, tab_id: Option<String>, ratio: f64) -> Result<(), String> {
    core_set_split_ratio(&app, tab_id.as_deref(), ratio)
}

#[tauri::command]
pub fn navigate_split(app: AppHandle, pane: String, url: String) -> Result<(), String> {
    navigate_split_view(&app, &pane, &url)
}

#[tauri::command]
pub fn navigate_tab(app: AppHandle, tab_id: String, url: String) -> Result<(), String> {
    navigate_tab_view(&app, &tab_id, &url)
}

#[tauri::command]
pub fn webview_go_back(app: AppHandle, tab_id: String) -> Result<(), String> {
    core_webview_go_back(&app, &tab_id)
}

#[tauri::command]
pub fn webview_go_forward(app: AppHandle, tab_id: String) -> Result<(), String> {
    core_webview_go_forward(&app, &tab_id)
}

#[tauri::command]
pub fn webview_reload(app: AppHandle, tab_id: String) -> Result<(), String> {
    core_webview_reload(&app, &tab_id)
}

#[tauri::command]
pub fn check_split_active(app: AppHandle) -> bool {
    is_split_active(&app)
}

#[tauri::command]
pub fn hide_webviews(app: AppHandle) -> Result<(), String> {
    hide_all_webviews(&app)
}

#[tauri::command]
pub fn set_drag_mode(app: AppHandle, active: bool) -> Result<(), String> {
    crate::core::webview::gtk_overlay::set_drag_mode(&app, active)
}

#[tauri::command]
pub fn show_tab_view(app: AppHandle, tab_id: String, bounds: SplitBounds) -> Result<bool, String> {
    crate::core::webview::gtk_overlay::activate_tab_view(&app, &tab_id, bounds)
}

#[tauri::command]
pub fn minimize_split_pane(
    app: AppHandle,
    tab_id: String,
    pane_to_minimize: String,
    minimized_tab_id: String,
    bounds: SplitBounds,
) -> Result<bool, String> {
    crate::core::webview::gtk_overlay::minimize_split_pane(
        &app,
        &tab_id,
        &pane_to_minimize,
        &minimized_tab_id,
        bounds,
    )
}

#[tauri::command]
pub fn merge_tabs_to_split(
    app: AppHandle,
    active_tab_id: String,
    other_tab_id: String,
    other_pane: String,
    bounds: SplitBounds,
) -> Result<bool, String> {
    crate::core::webview::gtk_overlay::merge_tabs_to_split(
        &app,
        &active_tab_id,
        &other_tab_id,
        &other_pane,
        bounds,
    )
}

#[tauri::command]
pub fn close_tab(app: AppHandle, tab_id: String) -> Result<(), String> {
    close_tab_view(&app, &tab_id)
}

#[tauri::command]
pub fn close_split(app: AppHandle) -> Result<(), String> {
    close_split_views(&app)
}

#[tauri::command]
pub fn get_cache_info(app: AppHandle) -> Result<CacheInfo, String> {
    Ok(core_get_cache_info(&app))
}

#[tauri::command]
pub fn clear_browser_cache(app: AppHandle, scope: Option<String>) -> Result<CacheInfo, String> {
    core_clear_browser_cache(&app, scope.as_deref())
}

#[tauri::command]
pub fn webview_media_command(
    app: AppHandle,
    tab_id: Option<String>,
    command: String,
    value: Option<f64>,
) -> Result<(), String> {
    crate::core::webview::execute_webview_media_command(&app, tab_id.as_deref(), &command, value)
}
