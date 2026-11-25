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

use gtk::prelude::*;
use tauri::AppHandle;

const MAX_WALLPAPER_BYTES: u64 = 50 * 1024 * 1024;

fn expand_tilde(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    if trimmed == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    } else if let Some(rest) = trimmed.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(trimmed)
}

fn mime_type_for_path(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        "avif" => Some("image/avif"),
        _ => None,
    }
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((n >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3f) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    out
}

pub fn pick_wallpaper_directory(app: &AppHandle) -> Result<Option<String>, String> {
    let app_handle = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();

    app.run_on_main_thread(move || {
        let parent_window = crate::core::download::get_toplevel_window(&app_handle);
        let dialog = gtk::FileChooserDialog::with_buttons(
            Some("Select Wallpaper Folder"),
            parent_window.as_ref(),
            gtk::FileChooserAction::SelectFolder,
            &[
                ("_Cancel", gtk::ResponseType::Cancel),
                ("_Select", gtk::ResponseType::Accept),
            ],
        );

        dialog.set_modal(true);
        dialog.set_destroy_with_parent(true);
        if let Some(ref parent) = parent_window {
            dialog.set_transient_for(Some(parent));
        }
        dialog.set_position(gtk::WindowPosition::CenterOnParent);
        dialog.set_keep_above(true);

        let configured = crate::core::config::load_config()
            .wallpaper_settings
            .folder_path;
        let initial_dir = if !configured.trim().is_empty() {
            expand_tilde(&configured)
        } else {
            dirs::picture_dir()
                .or_else(dirs::home_dir)
                .unwrap_or_else(|| PathBuf::from("."))
        };
        if initial_dir.is_dir() {
            dialog.set_current_folder(&initial_dir);
        }

        dialog.show_all();
        dialog.present();

        let result = if dialog.run() == gtk::ResponseType::Accept {
            dialog.filename().map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        unsafe {
            dialog.destroy();
        }
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;

    rx.recv().map_err(|e| e.to_string())
}

pub fn list_wallpaper_images(folder_path: &str) -> Result<Vec<String>, String> {
    let trimmed = folder_path.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let dir = expand_tilde(trimmed);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read wallpaper folder: {}", e))?;

    let mut images: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && mime_type_for_path(path).is_some())
        .map(|path| path.to_string_lossy().to_string())
        .collect();

    images.sort();
    Ok(images)
}

pub fn load_wallpaper_data_url(file_path: &str) -> Result<String, String> {
    let path = expand_tilde(file_path);
    if !path.is_file() {
        return Err("Wallpaper image file does not exist".to_string());
    }

    let mime = mime_type_for_path(&path)
        .ok_or_else(|| "Unsupported wallpaper image format".to_string())?;

    let meta = fs::metadata(&path)
        .map_err(|e| format!("Failed to inspect wallpaper image: {}", e))?;
    if meta.len() > MAX_WALLPAPER_BYTES {
        return Err("Wallpaper image exceeds 50 MB size limit".to_string());
    }

    let bytes = fs::read(&path)
        .map_err(|e| format!("Failed to read wallpaper image: {}", e))?;

    Ok(format!("data:{};base64,{}", mime, encode_base64(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("yoonspace_wallpaper_test_{}_{}", name, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_only_supported_images_sorted() {
        let dir = make_temp_dir("list");
        fs::write(dir.join("b.jpg"), b"jpg").unwrap();
        fs::write(dir.join("a.PNG"), b"png").unwrap();
        fs::write(dir.join("notes.txt"), b"txt").unwrap();
        fs::create_dir_all(dir.join("subdir.png")).unwrap();

        let images = list_wallpaper_images(dir.to_str().unwrap()).unwrap();
        assert_eq!(images.len(), 2);
        assert!(images[0].ends_with("a.PNG"));
        assert!(images[1].ends_with("b.jpg"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn loads_image_as_data_url() {
        let dir = make_temp_dir("load");
        let img_path = dir.join("sample.png");
        fs::write(&img_path, b"hello").unwrap();

        let data_url = load_wallpaper_data_url(img_path.to_str().unwrap()).unwrap();
        assert_eq!(data_url, "data:image/png;base64,aGVsbG8=");

        let _ = fs::remove_dir_all(&dir);
    }
}
