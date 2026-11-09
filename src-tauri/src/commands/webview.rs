use tauri::AppHandle;
use crate::core::webview::{
    close_split_views, is_split_active, navigate_split_view, spawn_split_views,
    update_split_bounds, SplitBounds, SplitViewRequest,
};

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
pub fn close_split(app: AppHandle) -> Result<(), String> {
    close_split_views(&app)
}
