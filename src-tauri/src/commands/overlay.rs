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

#[tauri::command]
pub fn show_overlay_notification(
    app: AppHandle,
    title: String,
    message: String,
    notification_type: Option<String>,
    download_id: Option<String>,
) -> Result<(), String> {
    let n_type = notification_type.unwrap_or_else(|| "info".to_string());
    crate::core::overlay::show_notification(
        &app,
        &title,
        &message,
        &n_type,
        download_id.as_deref(),
    );
    Ok(())
}

#[tauri::command]
pub fn hide_overlay_notification(app: AppHandle) -> Result<(), String> {
    crate::core::overlay::hide_notification(&app);
    Ok(())
}

#[tauri::command]
pub fn set_overlay_right_offset(app: AppHandle, offset: i32) -> Result<(), String> {
    crate::core::overlay::set_right_offset(&app, offset);
    Ok(())
}
