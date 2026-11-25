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
pub fn select_wallpaper_dir(app: AppHandle) -> Result<Option<String>, String> {
    crate::core::wallpaper::pick_wallpaper_directory(&app)
}

#[tauri::command]
pub fn list_wallpaper_images(folder_path: String) -> Result<Vec<String>, String> {
    crate::core::wallpaper::list_wallpaper_images(&folder_path)
}

#[tauri::command]
pub fn load_wallpaper_image(file_path: String) -> Result<String, String> {
    crate::core::wallpaper::load_wallpaper_data_url(&file_path)
}
