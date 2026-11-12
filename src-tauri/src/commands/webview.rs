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
    close_split_views, close_tab_view, hide_all_webviews, is_split_active, navigate_split_view,
    spawn_single_view as core_spawn_single_view, spawn_split_views, update_split_bounds,
    SingleViewRequest, SplitBounds, SplitViewRequest,
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
pub fn navigate_split(app: AppHandle, pane: String, url: String) -> Result<(), String> {
    navigate_split_view(&app, &pane, &url)
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
pub fn close_tab(app: AppHandle, tab_id: String) -> Result<(), String> {
    close_tab_view(&app, &tab_id)
}

#[tauri::command]
pub fn close_split(app: AppHandle) -> Result<(), String> {
    close_split_views(&app)
}
