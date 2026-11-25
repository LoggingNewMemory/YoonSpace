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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use gtk::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use webkit2gtk::{Download, DownloadExt, URIRequestExt, URIResponseExt};

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
static CONTEXT_INITIALIZED: AtomicBool = AtomicBool::new(false);
static NEXT_DOWNLOAD_SEQ: AtomicU64 = AtomicU64::new(1);
static REGISTERED_CONTEXTS: Mutex<Option<HashSet<usize>>> = Mutex::new(None);

thread_local! {
    static ACTIVE_DOWNLOADS: RefCell<HashMap<String, Download>> = RefCell::new(HashMap::new());
}

fn with_downloads<F, R>(f: F) -> R
where
    F: FnOnce(&mut Vec<DownloadItem>) -> R,
{
    let mut guard = DOWNLOADS.lock().unwrap();
    f(guard.get_or_insert_with(Vec::new))
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
    f(guard.get_or_insert_with(HashSet::new))
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
    !uri.is_empty() && with_downloading_uris(|set| set.contains(uri))
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
    if !Path::new(&dest).exists() {
        return Err(format!("File does not exist: {}", dest));
    }

    std::process::Command::new("xdg-open")
        .arg(&dest)
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;

    Ok(())
}

pub fn open_folder(path: &str) -> Result<(), String> {
    let raw = if path.trim().is_empty() {
        crate::core::config::load_config().download_settings.download_dir
    } else {
        path.to_string()
    };
    let target_path = resolve_existing_download_dir(&raw);

    std::process::Command::new("xdg-open")
        .arg(&target_path)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;

    Ok(())
}

pub fn cancel_download_by_id(app: &AppHandle, id: &str) -> Result<(), String> {
    crate::core::overlay::hide_notification(app);
    let id_clone = id.to_string();
    let _ = app.run_on_main_thread(move || {
        if let Some(dl) = with_active_downloads(|map| map.remove(&id_clone)) {
            dl.cancel();
        }
    });

    let cancelled_item = with_downloads(|list| {
        list.iter_mut().find(|d| d.id == id).map(|item| {
            item.state = "cancelled".to_string();
            item.clone()
        })
    });
    if let Some(item) = cancelled_item {
        let _ = app.emit("download-cancelled", item);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Filename & Extension Helpers
// ---------------------------------------------------------------------------

const COMPOUND_EXTENSIONS: &[&str] = &["tar.gz", "tar.bz2", "tar.xz", "tar.zst"];

pub fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|&c| c != '/' && c != '\\' && !c.is_control())
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        "download".to_string()
    } else {
        trimmed.to_string()
    }
}

fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut iter = input.bytes();
    while let Some(b) = iter.next() {
        if b == b'%' {
            let h1 = iter.next();
            let h2 = iter.next();
            if let (Some(h1), Some(h2)) = (h1, h2) {
                if let Ok(val) = u8::from_str_radix(
                    std::str::from_utf8(&[h1, h2]).unwrap_or(""),
                    16,
                ) {
                    bytes.push(val);
                    continue;
                }
                bytes.extend_from_slice(&[b'%', h1, h2]);
                continue;
            }
            bytes.push(b'%');
            if let Some(h1) = h1 {
                bytes.push(h1);
            }
            continue;
        }
        bytes.push(b);
    }
    String::from_utf8_lossy(&bytes).to_string()
}

fn split_stem_and_ext(filename: &str) -> (String, Option<String>) {
    let lower = filename.to_ascii_lowercase();
    for compound in COMPOUND_EXTENSIONS {
        let suffix = format!(".{}", compound);
        if lower.ends_with(&suffix) && filename.len() > suffix.len() {
            return (
                filename[..filename.len() - suffix.len()].to_string(),
                Some((*compound).to_string()),
            );
        }
    }

    if let Some(dot_idx) = filename.rfind('.') {
        let ext = &filename[dot_idx + 1..];
        if dot_idx > 0 && !ext.is_empty() && ext.len() <= 10 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
            return (filename[..dot_idx].to_string(), Some(ext.to_string()));
        }
    }

    (filename.to_string(), None)
}

fn infer_extension_from_mime(mime: &str) -> Option<String> {
    let clean = mime.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    let (media_type, subtype) = clean.split_once('/')?;

    match clean.as_str() {
        "image/jpeg" | "image/jpg" | "image/pjpeg" => return Some("jpeg".to_string()),
        "image/x-icon" | "image/vnd.microsoft.icon" => return Some("ico".to_string()),
        "text/plain" => return Some("txt".to_string()),
        "text/markdown" => return Some("md".to_string()),
        "text/javascript" | "application/javascript" | "application/x-javascript" => return Some("js".to_string()),
        "audio/mpeg" => return Some("mp3".to_string()),
        "audio/mp4" => return Some("m4a".to_string()),
        "audio/webm" => return Some("weba".to_string()),
        "video/quicktime" => return Some("mov".to_string()),
        "video/x-matroska" => return Some("mkv".to_string()),
        "video/x-msvideo" => return Some("avi".to_string()),
        "video/ogg" => return Some("ogv".to_string()),
        "application/gzip" | "application/x-gzip" => return Some("gz".to_string()),
        "application/x-bzip2" => return Some("bz2".to_string()),
        "application/zstd" => return Some("zst".to_string()),
        "application/x-7z-compressed" => return Some("7z".to_string()),
        "application/vnd.rar" | "application/x-rar-compressed" => return Some("rar".to_string()),
        "application/x-bittorrent" => return Some("torrent".to_string()),
        "application/vnd.debian.binary-package" | "application/x-debian-package" => return Some("deb".to_string()),
        "application/x-iso9660-image" => return Some("iso".to_string()),
        "application/vnd.android.package-archive" => return Some("apk".to_string()),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => return Some("docx".to_string()),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => return Some("xlsx".to_string()),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" => return Some("pptx".to_string()),
        "application/octet-stream" | "application/x-www-form-urlencoded" => return None,
        _ => {}
    }

    let base = subtype.split('+').next().unwrap_or(subtype);
    let base = base.strip_prefix("x-").unwrap_or(base);
    if base.is_empty()
        || base.len() > 10
        || (base.contains('-') && media_type == "application")
        || !base.chars().all(|c| c.is_ascii_alphanumeric())
        || !base.chars().any(|c| c.is_ascii_alphabetic())
    {
        return None;
    }

    Some(base.to_string())
}

fn extract_extension_from_url(url_str: &str) -> Option<String> {
    if url_str.starts_with("data:") {
        let meta = url_str.strip_prefix("data:")?.split(',').next()?;
        let mime = meta.split(';').next()?.trim();
        return infer_extension_from_mime(mime);
    }

    let parsed = url::Url::parse(url_str).ok()?;
    if let Some(last) = parsed.path_segments().and_then(|s| s.filter(|p| !p.is_empty()).last()) {
        let decoded = percent_decode(last.trim());
        if let (_, Some(ext)) = split_stem_and_ext(&decoded) {
            let lower = ext.to_ascii_lowercase();
            if lower.chars().any(|c| c.is_ascii_alphabetic())
                && !matches!(lower.as_str(), "php" | "asp" | "aspx" | "cgi" | "jsp" | "html" | "htm")
            {
                return Some(lower);
            }
        }
    }

    for (k, v) in parsed.query_pairs() {
        let key = k.to_ascii_lowercase();
        if matches!(key.as_str(), "format" | "fmt" | "ext" | "extension") {
            let lower = v.trim().trim_start_matches('.').to_ascii_lowercase();
            if !lower.is_empty()
                && lower.len() <= 10
                && lower.chars().all(|c| c.is_ascii_alphanumeric())
                && lower.chars().any(|c| c.is_ascii_alphabetic())
            {
                return Some(lower);
            }
        }
    }

    None
}

fn extract_filename_from_url(url_str: &str) -> Option<String> {
    if url_str.starts_with("data:") {
        return extract_extension_from_url(url_str).map(|ext| format!("download.{}", ext));
    }

    let parsed = url::Url::parse(url_str).ok()?;
    for (k, v) in parsed.query_pairs() {
        let key = k.to_ascii_lowercase();
        if key == "file" || key == "filename" || key == "name" {
            let cleaned = sanitize_filename(&percent_decode(&v));
            if cleaned != "download" {
                return Some(cleaned);
            }
        }
    }

    let last = parsed.path_segments()?.filter(|p| !p.is_empty()).last()?;
    let cleaned = sanitize_filename(&percent_decode(last));
    (cleaned != "download").then_some(cleaned)
}

/// Resolves the destination filename from WebKitGTK's response & source URL.
/// Follows the source filename/extension directly and ensures legacy `.jpe`/`.jfif` becomes `.jpeg`.
fn resolve_download_filename(
    cd_filename: Option<&str>,
    suggested_filename: &str,
    effective_url: &str,
    req_url: &str,
    mime_opt: Option<&str>,
) -> String {
    let url_name = extract_filename_from_url(effective_url)
        .or_else(|| extract_filename_from_url(req_url));
    let url_has_ext = url_name
        .as_deref()
        .and_then(|n| split_stem_and_ext(n).1)
        .map(|ext| {
            let lower = ext.to_ascii_lowercase();
            lower.chars().any(|c| c.is_ascii_alphabetic())
                && !matches!(lower.as_str(), "php" | "asp" | "aspx" | "cgi" | "jsp")
        })
        .unwrap_or(false);

    let mut name = if let Some(cd) = cd_filename.filter(|s| !s.trim().is_empty()) {
        cd.to_string()
    } else if url_has_ext {
        url_name.unwrap()
    } else if !suggested_filename.trim().is_empty() {
        suggested_filename.to_string()
    } else {
        url_name.unwrap_or_else(|| "download".to_string())
    };

    if let Some(pos) = name.find('?') {
        name.truncate(pos);
    }
    if let Some(pos) = name.find('#') {
        name.truncate(pos);
    }
    name = sanitize_filename(&name);

    // GLib/shared-mime-info on Linux maps `image/jpeg` to `.jpe` / `.jfif`
    let (stem, ext_opt) = split_stem_and_ext(&name);
    match ext_opt.as_deref().map(str::to_ascii_lowercase).as_deref() {
        Some("jpe" | "jfif" | "jif") => {
            let safe_stem = if stem.is_empty() { "download" } else { &stem };
            name = format!("{}.jpeg", safe_stem);
        }
        None => {
            let ext = extract_extension_from_url(effective_url)
                .or_else(|| extract_extension_from_url(req_url))
                .or_else(|| mime_opt.and_then(infer_extension_from_mime));
            if let Some(ext) = ext {
                name = format!("{}.{}", name, ext);
            }
        }
        _ => {}
    }

    name
}

pub fn get_unique_destination_path(dir: &Path, filename: &str) -> PathBuf {
    let initial = dir.join(filename);
    if !initial.exists() {
        return initial;
    }

    let (stem, ext_opt) = split_stem_and_ext(filename);
    let ext = ext_opt.map(|e| format!(".{}", e)).unwrap_or_default();

    let mut counter = 1;
    loop {
        let candidate = dir.join(format!("{} ({}){}", stem, counter, ext));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
        if counter > 9999 {
            return dir.join(format!(
                "{}_{}{}",
                stem,
                SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
                ext
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Directory Picker
// ---------------------------------------------------------------------------

fn get_toplevel_window(app: &AppHandle) -> Option<gtk::Window> {
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
    gtk::Window::list_toplevels()
        .into_iter()
        .filter_map(|w| w.dynamic_cast::<gtk::Window>().ok())
        .find(|w| w.is_visible())
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

        let cur_path = resolve_existing_download_dir(
            &crate::core::config::load_config().download_settings.download_dir,
        );
        if cur_path.is_dir() {
            dialog.set_current_folder(&cur_path);
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

// ---------------------------------------------------------------------------
// WebKitGTK Download Lifecycle
// ---------------------------------------------------------------------------

pub fn init_global_download_handler(app: &AppHandle) {
    if CONTEXT_INITIALIZED.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(context) = webkit2gtk::WebContext::default() {
            attach_context_download_listener(&app_handle, &context);
        }
        if let Some(main_wv) = app_handle.get_webview("main") {
            let app_main = app_handle.clone();
            let _ = main_wv.with_webview(move |pw| {
                use webkit2gtk::WebViewExt;
                if let Some(context) = pw.inner().context() {
                    attach_context_download_listener(&app_main, &context);
                }
            });
        }
    });
}

pub fn attach_context_download_listener(app: &AppHandle, context: &webkit2gtk::WebContext) {
    let ptr = context.as_ptr() as usize;
    {
        let mut guard = REGISTERED_CONTEXTS.lock().unwrap();
        let set = guard.get_or_insert_with(HashSet::new);
        if !set.insert(ptr) {
            return;
        }
    }

    // Connect with `after = true` so this runs after wry's default `download-started`
    // listener(s), allowing `attach_download_signals` to replace wry's hardcoded
    // `decide-destination` handler (which otherwise returns `true` for `dirs::download_dir()`).
    let app_handle = app.clone();
    context.connect_local("download-started", true, move |values| {
        if let Some(download) = values.get(1).and_then(|v| v.get::<Download>().ok()) {
            attach_download_signals(&app_handle, &download);
        }
        None
    });
}

fn clear_existing_decide_destination_handlers(download: &Download) {
    unsafe {
        use gtk::glib::translate::IntoGlib;
        let sig_id = gtk::glib::gobject_ffi::g_signal_lookup(
            b"decide-destination\0".as_ptr() as *const _,
            gtk::glib::object::ObjectExt::type_(download).into_glib(),
        );
        if sig_id != 0 {
            gtk::glib::gobject_ffi::g_signal_handlers_disconnect_matched(
                download.as_ptr() as *mut _,
                gtk::glib::gobject_ffi::G_SIGNAL_MATCH_ID,
                sig_id,
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            );
        }
    }
}

fn resolve_existing_download_dir(raw: &str) -> PathBuf {
    let configured = crate::core::config::resolve_download_dir(raw);
    if configured.is_dir() {
        return configured;
    }

    let fallback = PathBuf::from(crate::core::config::default_download_dir());
    if !fallback.exists() {
        let _ = fs::create_dir_all(&fallback);
    }
    fallback
}

fn path_from_dest_uri(dest_uri: &str) -> String {
    if dest_uri.starts_with("file://") {
        if let Ok((path, _)) = gtk::glib::filename_from_uri(dest_uri) {
            return path.to_string_lossy().to_string();
        }
        return dest_uri[7..].to_string();
    }
    dest_uri.to_string()
}

pub fn attach_download_signals(app: &AppHandle, download: &Download) {
    // Strip any pre-attached `decide-destination` handlers (e.g. wry's default
    // handler that forces `dirs::download_dir()` and stops signal propagation).
    clear_existing_decide_destination_handlers(download);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let seq = NEXT_DOWNLOAD_SEQ.fetch_add(1, Ordering::Relaxed);
    let download_id = format!("dl_{}_{}", now, seq);

    let req_url = download
        .request()
        .and_then(|r| r.uri())
        .map(|u| u.to_string())
        .unwrap_or_default();

    if !req_url.is_empty() {
        add_downloading_uri(&req_url);
    }

    let initial_name = resolve_download_filename(None, "", &req_url, &req_url, None);
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

    // 1. Decide Destination
    let dl_id_decide = download_id.clone();
    let req_url_decide = req_url.clone();
    download.connect_decide_destination(move |dl, suggested_filename| -> bool {
        let config = crate::core::config::load_config();
        let download_dir = resolve_existing_download_dir(&config.download_settings.download_dir);

        let resp = dl.response();
        let resp_mime = resp.as_ref().and_then(|r| r.mime_type()).map(|s| s.to_string());
        let resp_url = resp
            .as_ref()
            .and_then(|r| r.uri())
            .map(|u| u.to_string())
            .filter(|u| !u.is_empty());
        let effective_url = resp_url.as_deref().unwrap_or(&req_url_decide);

        let cd_filename = resp.as_ref().and_then(|r| {
            r.http_headers()
                .and_then(|h| h.content_disposition())
                .and_then(|(_, params)| params.get("filename").map(|s| s.to_string()))
        });
        let raw_suggested = if !suggested_filename.trim().is_empty() {
            suggested_filename.to_string()
        } else {
            resp.as_ref()
                .and_then(|r| r.suggested_filename())
                .map(|s| s.to_string())
                .unwrap_or_default()
        };

        let resolved_name = resolve_download_filename(
            cd_filename.as_deref(),
            &raw_suggested,
            effective_url,
            &req_url_decide,
            resp_mime.as_deref(),
        );

        let unique_dest = get_unique_destination_path(&download_dir, &resolved_name);
        let final_filename = unique_dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or(resolved_name);
        let path_str = unique_dest.to_string_lossy().to_string();
        let total = resp.as_ref().map(|r| r.content_length()).unwrap_or(0);

        with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_decide) {
                item.filename = final_filename;
                item.destination = path_str.clone();
                if total > 0 {
                    item.total_bytes = total;
                }
            }
        });

        dl.set_destination(&path_str);

        true
    });

    // 2. Created Destination
    let dl_id_dest = download_id.clone();
    download.connect_created_destination(move |_dl, destination_path| {
        let local_path = path_from_dest_uri(destination_path);
        with_downloads(|list| {
            if let Some(item) = list.iter_mut().find(|d| d.id == dl_id_dest) {
                if item.destination.is_empty() {
                    item.destination = local_path;
                }
            }
        });
    });

    // 3. Progress (throttled to avoid spamming IPC/UI on fast transfers)
    let app_progress = app.clone();
    let dl_id_progress = download_id.clone();
    let last_emit = std::rc::Rc::new(std::cell::Cell::new(Instant::now()));
    download.connect_received_data(move |dl, _data_len| {
        let received = dl.received_data_length();
        let progress = dl.estimated_progress();
        let total = dl.response().map(|r| r.content_length()).unwrap_or(0);

        let updated_item = with_downloads(|list| {
            list.iter_mut().find(|d| d.id == dl_id_progress).map(|item| {
                item.received_bytes = received;
                if total > 0 {
                    item.total_bytes = total;
                }
                item.progress = progress;
                item.clone()
            })
        });

        if let Some(item) = updated_item {
            if last_emit.get().elapsed().as_millis() >= 100 {
                last_emit.set(Instant::now());
                crate::core::overlay::update_download_progress(&app_progress, &item);
                let _ = app_progress.emit("download-progress", item);
            }
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
            list.iter_mut().find(|d| d.id == dl_id_finish).map(|item| {
                item.state = "completed".to_string();
                item.progress = 1.0;
                if let Some(dest_uri) = dl.destination() {
                    item.destination = path_from_dest_uri(dest_uri.as_str());
                }
                item.clone()
            })
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

    // 5. Failed / Cancelled
    let app_fail = app.clone();
    let dl_id_fail = download_id.clone();
    let req_url_fail = req_url.clone();
    download.connect_failed(move |_dl, error| {
        remove_downloading_uri(&req_url_fail);
        with_active_downloads(|map| {
            map.remove(&dl_id_fail);
        });

        let is_user_cancel = error.matches(webkit2gtk::DownloadError::CancelledByUser);
        let state_str = if is_user_cancel { "cancelled" } else { "failed" };
        let error_msg = error.message().to_string();

        let failed_item = with_downloads(|list| {
            list.iter_mut().find(|d| d.id == dl_id_fail).map(|item| {
                item.state = state_str.to_string();
                item.error = Some(error_msg.clone());
                item.clone()
            })
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

    crate::core::overlay::show_download_notification(app, &initial_item);
    let _ = app.emit("download-started", initial_item);
}
