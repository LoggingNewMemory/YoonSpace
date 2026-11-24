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

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use gtk::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use webkit2gtk::{Download, DownloadExt, URIRequestExt, URIResponseExt, WebContextExt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub filename: String,
    pub url: String,
    pub destination: String,
    pub total_bytes: u64,
    pub received_bytes: u64,
    pub progress: f64,
    pub state: String, // "downloading" | "completed" | "failed" | "cancelled"
    pub created_at: u64,
    pub error: Option<String>,
}

static DOWNLOADS: Mutex<Option<Vec<DownloadItem>>> = Mutex::new(None);
static DOWNLOADING_URIS: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static LAST_RIGHT_CLICKED_MEDIA: Mutex<Option<(String, Instant)>> = Mutex::new(None);
static LAST_CONTEXT_MENU_TIME: Mutex<Option<Instant>> = Mutex::new(None);
static CONTEXT_INITIALIZED: AtomicBool = AtomicBool::new(false);
static REGISTERED_CONTEXTS: Mutex<Option<HashSet<usize>>> = Mutex::new(None);

thread_local! {
    static ACTIVE_DOWNLOADS: RefCell<HashMap<String, Download>> = RefCell::new(HashMap::new());
}

fn with_downloads<F, R>(f: F) -> R
where
    F: FnOnce(&mut Vec<DownloadItem>) -> R,
{
    let mut guard = DOWNLOADS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(Vec::new());
    }
    f(guard.as_mut().unwrap())
}

fn with_active_downloads<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, Download>) -> R,
{
    ACTIVE_DOWNLOADS.with(|cell| {
        let mut map = cell.borrow_mut();
        f(&mut *map)
    })
}

fn with_downloading_uris<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashSet<String>) -> R,
{
    let mut guard = DOWNLOADING_URIS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashSet::new());
    }
    f(guard.as_mut().unwrap())
}

pub fn record_context_menu_event() {
    if let Ok(mut guard) = LAST_CONTEXT_MENU_TIME.lock() {
        *guard = Some(Instant::now());
    }
}

pub fn has_recent_context_menu() -> bool {
    if let Ok(guard) = LAST_CONTEXT_MENU_TIME.lock() {
        if let Some(instant) = *guard {
            if instant.elapsed().as_secs() < 30 {
                return true;
            }
        }
    }
    false
}

pub fn set_last_right_clicked_media(uri: &str) {
    if let Ok(mut guard) = LAST_RIGHT_CLICKED_MEDIA.lock() {
        *guard = Some((uri.to_string(), Instant::now()));
    }
}

pub fn is_last_right_clicked_media(uri: &str) -> bool {
    if let Ok(guard) = LAST_RIGHT_CLICKED_MEDIA.lock() {
        if let Some((last_uri, instant)) = guard.as_ref() {
            if instant.elapsed().as_secs() < 30 {
                if last_uri == uri || uri.starts_with(last_uri) || last_uri.starts_with(uri) {
                    return true;
                }
            }
        }
    }
    false
}

pub fn add_downloading_uri(uri: &str) {
    if !uri.is_empty() {
        with_downloading_uris(|set| {
            set.insert(uri.to_string());
        });
    }
}

pub fn remove_downloading_uri(uri: &str) {
    if !uri.is_empty() {
        with_downloading_uris(|set| {
            set.remove(uri);
        });
    }
}

pub fn is_downloading_uri(uri: &str) -> bool {
    if uri.is_empty() {
        return false;
    }
    with_downloading_uris(|set| set.contains(uri))
}

pub fn get_downloads() -> Vec<DownloadItem> {
    with_downloads(|list| list.clone())
}

pub fn clear_downloads() {
    with_downloads(|list| {
        list.retain(|d| d.state == "downloading");
    });
}

pub fn open_file_by_id(id: &str) -> Result<(), String> {
    let dest = with_downloads(|list| {
        list.iter()
            .find(|d| d.id == id)
            .map(|d| d.destination.clone())
    })
    .ok_or_else(|| "Download not found".to_string())?;

    if dest.is_empty() {
        return Err("Download destination is empty".to_string());
    }

    let path = Path::new(&dest);
    if !path.exists() {
        return Err(format!("File does not exist: {}", dest));
    }

    std::process::Command::new("xdg-open")
        .arg(&dest)
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}

pub fn open_folder(path: &str) -> Result<(), String> {
    let target = if path.is_empty() {
        let cfg = crate::core::config::load_config();
        cfg.download_settings.download_dir
    } else {
        path.to_string()
    };

    let p = Path::new(&target);
    if !p.exists() {
        let _ = fs::create_dir_all(p);
    }

    std::process::Command::new("xdg-open")
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;

    Ok(())
}

pub fn cancel_download_by_id(app: &AppHandle, id: &str) -> Result<(), String> {
    crate::core::overlay::hide_notification(app);
    let id_clone = id.to_string();
    let _ = app.run_on_main_thread(move || {
        let dl_opt = with_active_downloads(|map| map.remove(&id_clone));
        if let Some(dl) = dl_opt {
            dl.cancel();
        }
    });

    with_downloads(|list| {
        if let Some(item) = list.iter_mut().find(|d| d.id == id) {
            item.state = "cancelled".to_string();
        }
    });

    Ok(())
}

pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|&c| c != '/' && c != '\\' && c != '\0' && c != '\r' && c != '\n')
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "download".to_string()
    } else {
        trimmed.to_string()
    }
}

fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(h1), Some(h2)) = (h1, h2) {
                if let Ok(val) = u8::from_str_radix(
                    std::str::from_utf8(&[h1, h2]).unwrap_or(""),
                    16,
                ) {
                    bytes.push(val);
                    continue;
                }
            }
        }
        bytes.push(b);
    }
    String::from_utf8_lossy(&bytes).to_string()
}

pub fn infer_extension_from_mime(mime: &str) -> Option<&'static str> {
    let clean = mime.split(';').next().unwrap_or("").trim().to_lowercase();
    match clean.as_str() {
        "image/png" => Some("png"),
        "image/jpeg" | "image/jpg" => Some("jpeg"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("ico"),
        "image/avif" => Some("avif"),
        "image/tiff" => Some("tiff"),
        "application/pdf" => Some("pdf"),
        "application/zip" => Some("zip"),
        "application/gzip" | "application/x-gzip" | "application/x-tar" => Some("tar.gz"),
        "application/x-bzip2" => Some("tar.bz2"),
        "application/json" => Some("json"),
        "text/plain" => Some("txt"),
        "text/html" => Some("html"),
        "text/css" => Some("css"),
        "text/javascript" | "application/javascript" => Some("js"),
        "audio/mpeg" | "audio/mp3" => Some("mp3"),
        "audio/ogg" => Some("ogg"),
        "audio/wav" => Some("wav"),
        "video/mp4" => Some("mp4"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        _ => None,
    }
}

/// Extracts a clean file extension from a URL (path segments, query parameters).
/// Explicit safety guarantee: never allows .jpe or .jfif to escape (maps them to .jpeg).
pub fn extract_extension_from_url(url_str: &str) -> Option<String> {
    if url_str.is_empty() {
        return None;
    }

    let parsed = url::Url::parse(url_str)
        .or_else(|_| url::Url::parse(&format!("https://{}", url_str)))
        .ok()?;

    // Helper to validate and normalize extensions with safety guarantee
    let normalize_ext = |ext: &str| -> Option<String> {
        let clean = ext.trim().trim_start_matches('.').to_lowercase();
        if clean.is_empty() || clean.len() > 10 {
            return None;
        }

        // Filter out dynamic server scripts / pages
        if matches!(
            clean.as_str(),
            "php" | "asp" | "aspx" | "cgi" | "jsp" | "html" | "htm" | "ashx" | "cfm" | "do" | "action" | "pl"
        ) {
            return None;
        }

        // Numeric versions like "0", "1", "00" are not extensions
        if !clean.chars().any(|c| c.is_ascii_alphabetic()) {
            return None;
        }

        // Must be alphanumeric or contain a dot (for compound extensions)
        if !clean.chars().all(|c| c.is_ascii_alphanumeric() || c == '.') {
            return None;
        }

        // Explicit safety guarantee: never allow .jpe or .jfif to escape
        if clean == "jpe" || clean == "jfif" {
            return Some("jpeg".to_string());
        }

        Some(clean)
    };

    // 1. Check path segments
    let mut path_ext: Option<String> = None;
    if let Some(segments) = parsed.path_segments() {
        if let Some(last) = segments.last() {
            let decoded = percent_decode(last.trim());
            let lower = decoded.to_lowercase();

            // Multi-part extensions
            if lower.ends_with(".tar.gz") {
                path_ext = Some("tar.gz".to_string());
            } else if lower.ends_with(".tar.bz2") {
                path_ext = Some("tar.bz2".to_string());
            } else if lower.ends_with(".tar.xz") {
                path_ext = Some("tar.xz".to_string());
            } else if lower.ends_with(".tar.zst") {
                path_ext = Some("tar.zst".to_string());
            } else if let Some(dot_idx) = decoded.rfind('.') {
                let candidate = &decoded[dot_idx + 1..];
                path_ext = normalize_ext(candidate);
            }
        }
    }

    // If path extension is specific (and not a generic container like "bin" or "download"), return it
    if let Some(ref ext) = path_ext {
        if ext != "bin" && ext != "download" {
            return Some(ext.clone());
        }
    }

    // 2. Check query parameters (e.g. format=jpg, ext=png, file=name.jpeg)
    for (k, v) in parsed.query_pairs() {
        let key = k.to_lowercase();
        let val = v.trim().trim_start_matches('.').to_lowercase();

        if key == "format"
            || key == "fmt"
            || key == "ext"
            || key == "extension"
            || key == "fm"
            || key == "output"
            || key == "f"
        {
            if let Some(norm) = normalize_ext(&val) {
                return Some(norm);
            }
        }

        if key == "file" || key == "filename" || key == "name" {
            let decoded_val = percent_decode(&val);
            let lower_val = decoded_val.to_lowercase();
            if lower_val.ends_with(".tar.gz") {
                return Some("tar.gz".to_string());
            } else if lower_val.ends_with(".tar.bz2") {
                return Some("tar.bz2".to_string());
            } else if lower_val.ends_with(".tar.xz") {
                return Some("tar.xz".to_string());
            } else if lower_val.ends_with(".tar.zst") {
                return Some("tar.zst".to_string());
            } else if let Some(dot) = decoded_val.rfind('.') {
                let candidate = &decoded_val[dot + 1..];
                if let Some(norm) = normalize_ext(candidate) {
                    return Some(norm);
                }
            }
        }

        if key == "response-content-disposition" {
            if let Some(fn_part) = v.split("filename=").nth(1).or_else(|| v.split("filename*=").nth(1)) {
                let unquoted = fn_part.trim().trim_matches('"').trim_matches('\'');
                let decoded_fn = percent_decode(unquoted);
                if let Some(dot) = decoded_fn.rfind('.') {
                    let candidate = &decoded_fn[dot + 1..];
                    if let Some(norm) = normalize_ext(candidate) {
                        return Some(norm);
                    }
                }
            }
        }
    }

    // Fallback to path extension if available (even if "bin" or "download")
    path_ext
}

pub fn extract_filename_from_url_or_default(url_str: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url_str).or_else(|_| url::Url::parse(&format!("https://{}", url_str))) {
        if let Some(seg) = parsed.path_segments().and_then(|mut s| s.next_back()) {
            let decoded = percent_decode(seg);
            let cleaned = sanitize_filename(&decoded);
            if !cleaned.is_empty() && cleaned != "download" {
                return cleaned;
            }
        }
        for (k, v) in parsed.query_pairs() {
            let key = k.to_lowercase();
            if key == "file" || key == "filename" || key == "name" {
                let decoded = percent_decode(&v);
                let cleaned = sanitize_filename(&decoded);
                if !cleaned.is_empty() && cleaned != "download" {
                    return cleaned;
                }
            }
            if key == "response-content-disposition" {
                if let Some(fn_part) = v.split("filename=").nth(1).or_else(|| v.split("filename*=").nth(1)) {
                    let unquoted = fn_part.trim().trim_matches('"').trim_matches('\'');
                    let decoded = percent_decode(unquoted);
                    let cleaned = sanitize_filename(&decoded);
                    if !cleaned.is_empty() && cleaned != "download" {
                        return cleaned;
                    }
                }
            }
        }
    }
    "download".to_string()
}

/// Normalizes and cleans a candidate download filename using the suggested filename,
/// the source URL, and optional MIME content type.
///
/// Explicit safety guarantee: never allow .jpe or .jfif to escape (always normalizes to .jpeg or .jpg).
pub fn normalize_download_filename(filename: &str, url_str: &str, mime_opt: Option<&str>) -> String {
    let mut name = sanitize_filename(filename);

    if let Some(pos) = name.find('?') {
        name.truncate(pos);
    }
    if let Some(pos) = name.find('#') {
        name.truncate(pos);
    }
    let name = sanitize_filename(&name);

    let url_ext_opt = extract_extension_from_url(url_str);

    let lower_name = name.to_lowercase();
    let (mut stem, mut current_ext_opt) = if lower_name.ends_with(".tar.gz") {
        (name[..name.len() - 7].to_string(), Some("tar.gz".to_string()))
    } else if lower_name.ends_with(".tar.bz2") {
        (name[..name.len() - 8].to_string(), Some("tar.bz2".to_string()))
    } else if lower_name.ends_with(".tar.xz") {
        (name[..name.len() - 7].to_string(), Some("tar.xz".to_string()))
    } else if lower_name.ends_with(".tar.zst") {
        (name[..name.len() - 8].to_string(), Some("tar.zst".to_string()))
    } else {
        let p = Path::new(&name);
        let ext = p.extension().map(|e| e.to_string_lossy().to_string().to_lowercase());
        let s = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        (s, ext)
    };

    // If filename was bare ".jpe" or ".jfif", Path considers it a hidden file with stem ".jpe"/".jfif" and no extension.
    if current_ext_opt.is_none() {
        let s_lower = stem.trim().to_lowercase();
        if s_lower == ".jpe" || s_lower == "jpe" {
            stem = "download".to_string();
            current_ext_opt = Some("jpe".to_string());
        } else if s_lower == ".jfif" || s_lower == "jfif" {
            stem = "download".to_string();
            current_ext_opt = Some("jfif".to_string());
        }
    }

    let stem = if stem.trim().is_empty() || stem == "." {
        "download".to_string()
    } else {
        stem
    };

    let mut result = match current_ext_opt.as_deref() {
        Some("jpe") | Some("jfif") => {
            // Unwanted legacy JPEG extension: resolve to the best extension
            if let Some(ref uext) = url_ext_opt {
                if uext == "jpeg" || uext == "jpg" {
                    format!("{}.{}", stem, uext)
                } else if matches!(uext.as_str(), "png" | "webp" | "gif" | "svg") {
                    format!("{}.{}", stem, uext)
                } else {
                    format!("{}.jpeg", stem)
                }
            } else {
                format!("{}.jpeg", stem)
            }
        }
        None => {
            // No extension provided in suggested filename
            if let Some(ref uext) = url_ext_opt {
                format!("{}.{}", stem, uext)
            } else if let Some(mime) = mime_opt {
                if let Some(ext) = infer_extension_from_mime(mime) {
                    format!("{}.{}", stem, ext)
                } else {
                    stem
                }
            } else {
                stem
            }
        }
        Some(ext) => {
            let is_generic_or_script = ext == "bin"
                || ext == "download"
                || matches!(
                    ext,
                    "php" | "asp" | "aspx" | "cgi" | "jsp" | "html" | "htm" | "ashx" | "cfm" | "do" | "action"
                );

            if is_generic_or_script && url_ext_opt.is_some() {
                format!("{}.{}", stem, url_ext_opt.unwrap())
            } else if is_generic_or_script
                && mime_opt.is_some()
                && infer_extension_from_mime(mime_opt.unwrap()).is_some()
            {
                format!("{}.{}", stem, infer_extension_from_mime(mime_opt.unwrap()).unwrap())
            } else {
                format!("{}.{}", stem, ext)
            }
        }
    };

    // Explicit safety guarantee: never allow .jpe or .jfif to escape
    let lower_result = result.to_lowercase();
    if lower_result.ends_with(".jpe") {
        let p = Path::new(&result);
        let s = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "download".to_string());
        let s = if s.trim().is_empty() || s == ".jpe" || s == "jpe" { "download".to_string() } else { s };
        result = format!("{}.jpeg", s);
    } else if lower_result.ends_with(".jfif") {
        let p = Path::new(&result);
        let s = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "download".to_string());
        let s = if s.trim().is_empty() || s == ".jfif" || s == "jfif" { "download".to_string() } else { s };
        result = format!("{}.jpeg", s);
    }

    result
}

pub fn get_unique_destination_path(dir: &Path, filename: &str) -> PathBuf {
    let initial = dir.join(filename);
    if !initial.exists() {
        return initial;
    }

    let p = Path::new(filename);
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    let ext = p
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();

    let mut counter = 1;
    loop {
        let candidate = dir.join(format!("{} ({}){}", stem, counter, ext));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
        if counter > 9999 {
            return dir.join(format!("{}_{}{}", stem, SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(), ext));
        }
    }
}

pub fn get_toplevel_window(app: &AppHandle) -> Option<gtk::Window> {
    if let Some(win) = app.get_window("main") {
        if let Ok(vbox) = win.default_vbox() {
            if let Some(toplevel) = vbox.toplevel().and_then(|w| w.dynamic_cast::<gtk::Window>().ok()) {
                return Some(toplevel);
            }
        }
        if let Ok(gtk_win) = win.gtk_window() {
            return Some(gtk_win.upcast::<gtk::Window>());
        }
    }
    let toplevels = gtk::Window::list_toplevels();
    for w in toplevels {
        if let Ok(win) = w.dynamic_cast::<gtk::Window>() {
            if win.is_visible() {
                return Some(win);
            }
        }
    }
    None
}

pub fn pick_download_directory(app: &AppHandle) -> Result<Option<String>, String> {
    let app_handle = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();

    app.run_on_main_thread(move || {
        let parent_window = get_toplevel_window(&app_handle);

        let dialog = gtk::FileChooserDialog::with_buttons(
            Some("Select Download Directory"),
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

        let current_cfg = crate::core::config::load_config();
        let cur_path = PathBuf::from(&current_cfg.download_settings.download_dir);
        if cur_path.exists() {
            dialog.set_current_folder(&cur_path);
        }

        dialog.show_all();
        dialog.present();

        let resp = dialog.run();
        let result = if resp == gtk::ResponseType::Accept {
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

pub fn init_global_download_handler(app: &AppHandle) {
    if CONTEXT_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(context) = webkit2gtk::WebContext::default() {
            attach_context_download_listener(&app_handle, &context);
        }
    });
}

pub fn attach_context_download_listener(app: &AppHandle, context: &webkit2gtk::WebContext) {
    let ptr = context.as_ptr() as usize;
    let mut guard = REGISTERED_CONTEXTS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashSet::new());
    }
    let set = guard.as_mut().unwrap();
    if set.contains(&ptr) {
        return;
    }
    set.insert(ptr);

    let app_handle = app.clone();
    context.connect_download_started(move |_ctx, download| {
        attach_download_signals(&app_handle, download);
    });
}

pub fn attach_download_signals(app: &AppHandle, download: &Download) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let download_id = format!("dl_{}", now);

    let req_url = download
        .request()
        .and_then(|r| r.uri())
        .map(|u| u.to_string())
        .unwrap_or_default();

    if !req_url.is_empty() {
        add_downloading_uri(&req_url);
    }

    let raw_initial = extract_filename_from_url_or_default(&req_url);
    let initial_name = normalize_download_filename(&raw_initial, &req_url, None);

    let initial_item = DownloadItem {
        id: download_id.clone(),
        filename: initial_name,
        url: req_url.clone(),
        destination: String::new(),
        total_bytes: 0,
        received_bytes: 0,
        progress: 0.0,
        state: "downloading".to_string(),
        created_at: now as u64,
        error: None,
    };

    with_downloads(|list| {
        list.insert(0, initial_item.clone());
    });
    with_active_downloads(|map| {
        map.insert(download_id.clone(), download.clone());
    });

    crate::core::overlay::show_download_notification(app, &initial_item);
    let _ = app.emit("download-started", initial_item.clone());

    // 1. Decide Destination
    let app_decide = app.clone();
    let dl_id_decide = download_id.clone();
    let req_url_decide = req_url.clone();
    download.connect_decide_destination(move |dl, suggested_filename| -> bool {
        let is_from_menu = has_recent_context_menu();
        let is_save_as = is_from_menu || is_last_right_clicked_media(&req_url_decide);
        let config = crate::core::config::load_config();
        let download_dir = PathBuf::from(&config.download_settings.download_dir);
        if !download_dir.exists() {
            let _ = fs::create_dir_all(&download_dir);
        }

        // Determine filename
        let resp_mime = dl.response().and_then(|r| r.mime_type()).map(|s| s.to_string());
        let mime_ref = resp_mime.as_deref();

        let raw_filename = if !suggested_filename.trim().is_empty() {
            suggested_filename.to_string()
        } else if let Some(resp) = dl.response() {
            resp.suggested_filename()
                .map(|s| s.to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };

        let candidate_raw = if !raw_filename.trim().is_empty() {
            raw_filename
        } else {
            extract_filename_from_url_or_default(&req_url_decide)
        };

        let candidate_name = normalize_download_filename(&candidate_raw, &req_url_decide, mime_ref);

        if let Some(resp) = dl.response() {
            let total = resp.content_length();
            with_downloads(|list| {
                if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_decide) {
                    item.filename = candidate_name.clone();
                    item.total_bytes = total;
                }
            });
        }

        // Determine if we should prompt the Save As dialog
        // Prompts if: right-click Save As was used, OR if user has "always ask where to save" enabled
        let should_prompt = is_save_as || config.download_settings.ask_where_to_save;

        if should_prompt {
            let parent_window = get_toplevel_window(&app_decide);

            let dialog = gtk::FileChooserDialog::with_buttons(
                Some("Save File As..."),
                parent_window.as_ref(),
                gtk::FileChooserAction::Save,
                &[
                    ("_Cancel", gtk::ResponseType::Cancel),
                    ("_Save", gtk::ResponseType::Accept),
                ],
            );

            dialog.set_do_overwrite_confirmation(true);
            dialog.set_modal(true);
            dialog.set_destroy_with_parent(true);
            if let Some(ref parent) = parent_window {
                dialog.set_transient_for(Some(parent));
            }
            dialog.set_position(gtk::WindowPosition::CenterOnParent);
            dialog.set_keep_above(true);

            if download_dir.exists() {
                dialog.set_current_folder(&download_dir);
            }
            dialog.set_current_name(&candidate_name);

            dialog.show_all();
            dialog.present();

            let response = dialog.run();
            let chosen_path = if response == gtk::ResponseType::Accept {
                dialog.filename()
            } else {
                None
            };
            unsafe {
                dialog.destroy();
            }

            if let Some(chosen) = chosen_path {
                let chosen_name = chosen
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| candidate_name.clone());
                let final_name = normalize_download_filename(&chosen_name, &req_url_decide, mime_ref);
                let final_path = if final_name != chosen_name {
                    chosen.parent().map(|p| p.join(&final_name)).unwrap_or(chosen.clone())
                } else {
                    chosen.clone()
                };
                let path_str = final_path.to_string_lossy().to_string();
                let uri_str = gtk::glib::filename_to_uri(&final_path, None)
                    .map(|u| u.to_string())
                    .unwrap_or_else(|_| format!("file://{}", path_str));

                with_downloads(|list| {
                    if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_decide) {
                        item.filename = final_name;
                        item.destination = path_str;
                    }
                });

                dl.set_destination(&uri_str);
                return true;
            }

            // User cancelled or dialog closed without save
            dl.cancel();
            with_downloads(|list| {
                if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_decide) {
                    item.state = "cancelled".to_string();
                }
            });
            crate::core::overlay::hide_notification(&app_decide);
            let _ = app_decide.emit("download-cancelled", ());
            return true;
        }

        // Auto-save without prompt into download_dir
        let unique_dest = get_unique_destination_path(&download_dir, &candidate_name);
        let final_filename = unique_dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or(candidate_name);
        let path_str = unique_dest.to_string_lossy().to_string();

        with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_decide) {
                item.filename = final_filename;
                item.destination = path_str;
            }
        });

        if let Ok(uri) = gtk::glib::filename_to_uri(&unique_dest, None) {
            dl.set_destination(uri.as_str());
        } else {
            let fallback_uri = format!("file://{}", unique_dest.to_string_lossy());
            dl.set_destination(&fallback_uri);
        }

        true
    });

    // 2. Created Destination
    let dl_id_dest = download_id.clone();
    download.connect_created_destination(move |_dl, destination_path| {
        with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_dest) {
                if item.destination.is_empty() {
                    item.destination = destination_path.to_string();
                }
            }
        });
    });

    // 3. Received Data (Progress)
    let app_progress = app.clone();
    let dl_id_progress = download_id.clone();
    download.connect_received_data(move |dl, _data_len| {
        let received = dl.received_data_length();
        let progress = dl.estimated_progress();
        let total = dl.response().map(|r| r.content_length()).unwrap_or(0);

        let updated_item = with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_progress) {
                item.received_bytes = received;
                if total > 0 {
                    item.total_bytes = total;
                }
                item.progress = progress;
                Some(item.clone())
            } else {
                None
            }
        });

        if let Some(item) = updated_item {
            crate::core::overlay::update_download_progress(&app_progress, &item);
            let _ = app_progress.emit("download-progress", item);
        }
    });

    // 4. Finished
    let app_finish = app.clone();
    let dl_id_finish = download_id.clone();
    let req_url_finish = req_url.clone();
    download.connect_finished(move |dl| {
        remove_downloading_uri(&req_url_finish);
        with_active_downloads(|map| {
            map.remove(&dl_id_finish);
        });

        let completed_item = with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_finish) {
                item.state = "completed".to_string();
                item.progress = 1.0;
                if let Some(dest_uri) = dl.destination() {
                    let dest_str = dest_uri.as_str();
                    let file_path = if dest_str.starts_with("file://") {
                        if let Ok((path, _)) = gtk::glib::filename_from_uri(dest_str) {
                            path.to_string_lossy().to_string()
                        } else {
                            dest_str[7..].to_string()
                        }
                    } else {
                        dest_str.to_string()
                    };
                    item.destination = file_path;
                }
                Some(item.clone())
            } else {
                None
            }
        });

        if let Some(item) = completed_item {
            crate::core::overlay::show_download_completed(&app_finish, &item);
            let _ = app_finish.emit("download-completed", item.clone());

            let config = crate::core::config::load_config();
            if config.download_settings.open_folder_on_complete && !item.destination.is_empty() {
                let _ = open_folder(&config.download_settings.download_dir);
            }
        }
    });

    // 5. Failed
    let app_fail = app.clone();
    let dl_id_fail = download_id.clone();
    let req_url_fail = req_url.clone();
    download.connect_failed(move |_dl, error| {
        remove_downloading_uri(&req_url_fail);
        with_active_downloads(|map| {
            map.remove(&dl_id_fail);
        });

        let is_user_cancel = error.matches(webkit2gtk::DownloadError::CancelledByUser);
        let state_str = if is_user_cancel {
            "cancelled"
        } else {
            "failed"
        };
        let error_msg = error.message().to_string();

        let failed_item = with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_fail) {
                item.state = state_str.to_string();
                item.error = Some(error_msg.clone());
                Some(item.clone())
            } else {
                None
            }
        });

        if let Some(item) = failed_item {
            if is_user_cancel {
                crate::core::overlay::hide_notification(&app_fail);
                let _ = app_fail.emit("download-cancelled", item);
            } else {
                crate::core::overlay::show_download_failed(&app_fail, &item);
                let _ = app_fail.emit("download-failed", item);
            }
        }
    });
}
