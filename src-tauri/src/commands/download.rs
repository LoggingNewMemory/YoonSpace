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
use crate::core::download::DownloadItem;

#[tauri::command]
pub fn get_downloads() -> Vec<DownloadItem> {
    crate::core::download::get_downloads()
}

#[tauri::command]
pub fn clear_downloads() -> Result<(), String> {
    crate::core::download::clear_downloads();
    Ok(())
}

#[tauri::command]
pub fn open_download_file(id: String) -> Result<(), String> {
    crate::core::download::open_file_by_id(&id)
}

#[tauri::command]
pub fn open_download_dir(path: Option<String>) -> Result<(), String> {
    let target = path.unwrap_or_else(|| {
        let cfg = crate::core::config::load_config();
        cfg.download_settings.download_dir
    });
    crate::core::download::open_folder(&target)
}

#[tauri::command]
pub fn select_download_dir(app: AppHandle) -> Result<Option<String>, String> {
    crate::core::download::pick_download_directory(&app)
}

#[tauri::command]
pub fn cancel_download(app: AppHandle, id: String) -> Result<(), String> {
    crate::core::download::cancel_download_by_id(&app, &id)
}
