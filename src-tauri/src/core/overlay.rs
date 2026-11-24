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
use std::path::Path;
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::time::Instant;

use gtk::prelude::*;
use tauri::{AppHandle, Manager};
use webkit2gtk::{NavigationPolicyDecisionExt, PolicyDecisionExt, URIRequestExt, WebViewExt};

use crate::core::download::DownloadItem;

pub const OVERLAY_LAYER_NAME: &str = "yoonspace_overlay_layer";

static DISMISS_EPOCH: AtomicU64 = AtomicU64::new(0);
static RIGHT_OFFSET: AtomicI32 = AtomicI32::new(16);
const TOP_OFFSET: i32 = 116;

struct ActiveToastWidgets {
    download_id: Option<String>,
    cached_destination: String,
    last_update: Instant,
    webview: webkit2gtk::WebView,
}

thread_local! {
    static ACTIVE_TOAST: RefCell<Option<ActiveToastWidgets>> = const { RefCell::new(None) };
}

pub fn is_overlay_layer(widget: &gtk::Widget) -> bool {
    widget.widget_name().as_str() == OVERLAY_LAYER_NAME
}

pub fn ensure_overlay_layer_on_top(overlay: &gtk::Overlay) {
    if let Some(layer) = overlay
        .children()
        .into_iter()
        .find(|c| is_overlay_layer(c))
    {
        overlay.reorder_overlay(&layer, -1);
    }
}

pub fn ensure_overlay_layer(overlay: &gtk::Overlay) -> gtk::Box {
    if let Some(existing) = overlay
        .children()
        .into_iter()
        .find_map(|c| if is_overlay_layer(&c) { c.dynamic_cast::<gtk::Box>().ok() } else { None })
    {
        existing.set_halign(gtk::Align::End);
        existing.set_valign(gtk::Align::Start);
        existing.set_margin_top(TOP_OFFSET);
        existing.set_margin_end(RIGHT_OFFSET.load(Ordering::SeqCst));
        overlay.reorder_overlay(&existing, -1);
        return existing;
    }

    let layer = gtk::Box::new(gtk::Orientation::Vertical, 0);
    layer.set_widget_name(OVERLAY_LAYER_NAME);
    layer.set_halign(gtk::Align::End);
    layer.set_valign(gtk::Align::Start);
    layer.set_margin_top(TOP_OFFSET);
    layer.set_margin_end(RIGHT_OFFSET.load(Ordering::SeqCst));
    layer.style_context().add_class("yoonspace-toast-overlay");

    overlay.add_overlay(&layer);
    overlay.set_overlay_pass_through(&layer, false);
    overlay.reorder_overlay(&layer, -1);
    layer.hide();

    layer
}

pub fn init_overlay_css() {
    let provider = gtk::CssProvider::new();
    let css = "
        .yoonspace-toast-overlay {
            background-color: transparent;
            padding: 0;
            margin: 0;
            border: none;
        }
    ";
    if provider.load_from_data(css.as_bytes()).is_ok() {
        if let Some(screen) = gtk::gdk::Screen::default() {
            gtk::StyleContext::add_provider_for_screen(
                &screen,
                &provider,
                gtk::STYLE_PROVIDER_PRIORITY_USER,
            );
        }
    }
}

pub fn set_right_offset(app: &AppHandle, offset: i32) {
    let final_margin = if offset > 0 { offset + 16 } else { 16 };
    RIGHT_OFFSET.store(final_margin, Ordering::SeqCst);
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(window) = app_handle.get_window("main") {
            if let Ok(vbox) = window.default_vbox() {
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    if let Some(layer) = overlay.children().into_iter().find(|c| is_overlay_layer(c)) {
                        layer.set_margin_end(final_margin);
                        layer.set_margin_top(TOP_OFFSET);
                        layer.queue_resize();
                    }
                }
            }
        }
    });
}

fn get_overlay_container(app: &AppHandle) -> Option<(gtk::Overlay, gtk::Box)> {
    let window = app.get_window("main")?;
    let vbox = window.default_vbox().ok()?;
    let mut overlay_opt = vbox
        .children()
        .into_iter()
        .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok());

    if overlay_opt.is_none() {
        let children = vbox.children();
        if !children.is_empty() {
            let main_widget = &children[0];
            let new_overlay = gtk::Overlay::new();
            vbox.remove(main_widget);
            new_overlay.add(main_widget);
            vbox.pack_start(&new_overlay, true, true, 0);
            new_overlay.show_all();
            overlay_opt = Some(new_overlay);
        }
    }

    let overlay = overlay_opt?;
    let layer = ensure_overlay_layer(&overlay);
    Some((overlay, layer))
}

fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

const BASE_CSS: &str = r#"
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    user-select: none;
    -webkit-user-select: none;
}
html, body {
    background: transparent !important;
    overflow: hidden;
    width: 100%;
    height: 100%;
    font-family: 'Google Sans', 'Google Sans Text', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif;
    display: flex;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 4px;
}
.toast-card {
    width: 348px;
    background: rgba(23, 23, 26, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 14px;
    padding: 12px 14px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    display: flex;
    flex-direction: column;
    gap: 7px;
    animation: toast-in 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes toast-in {
    from {
        opacity: 0;
        transform: translateY(-8px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}
.toast-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.toast-title-group {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
}
.toast-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}
.icon-downloading {
    color: #f85e2a;
    animation: bounce 1.4s infinite ease-in-out;
}
@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(2px); }
}
.icon-completed {
    color: #4ade80;
}
.icon-failed {
    color: #ff5449;
}
.toast-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.toast-title.error {
    color: #ff5449;
}
.btn-close {
    background: transparent;
    border: none;
    color: #8e8d91;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
}
.btn-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}
.toast-filename {
    font-size: 12px;
    color: #c4c2c0;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.progress-container {
    width: 100%;
    height: 4px;
    background: #28282e;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 1px;
}
.progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #f85e2a, #ff7a47);
    border-radius: 2px;
    transition: width 0.12s ease-out;
}
.toast-info {
    font-size: 11px;
    color: #f85e2a;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.toast-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
}
.btn-action {
    background: #25252b;
    border: 1px solid #36363f;
    border-radius: 8px;
    color: #e2bfb4;
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 13px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    outline: none;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.btn-action:hover {
    background: #34343c;
    border-color: #4a4a55;
    color: #ffffff;
}
.btn-action:active {
    background: #40404a;
}
"#;

fn render_downloading_html(filename: &str, dl_id: &str, received: u64, total: u64, progress: f64) -> String {
    let safe_name = escape_html(filename);
    let safe_id = escape_html(dl_id);
    let pct = (progress.clamp(0.0, 1.0) * 100.0).round() as u32;
    let info_text = if total > 0 {
        format!("{} / {} ({}%)", format_file_size(received), format_file_size(total), pct)
    } else {
        format!("Downloaded {}", format_file_size(received))
    };

    format!(r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{}</style>
<script>
window.updateProgress = function(pct, info, name) {{
    var pb = document.getElementById('progress-bar');
    if (pb) pb.style.width = Math.min(100, Math.max(0, pct)) + '%';
    var st = document.getElementById('progress-info');
    if (st && info) st.textContent = info;
    var fn = document.getElementById('toast-filename');
    if (fn && name) fn.textContent = name;
}};
</script>
</head>
<body>
  <div class="toast-card">
    <div class="toast-header">
      <div class="toast-title-group">
        <svg class="toast-icon icon-downloading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v13M5 12l7 7 7-7"/>
        </svg>
        <span class="toast-title">Downloading...</span>
      </div>
      <button class="btn-close" onclick="location.href='action://close'" title="Dismiss">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="toast-filename" class="toast-filename">{}</div>
    <div class="progress-container">
      <div id="progress-bar" class="progress-bar" style="width: {}%;"></div>
    </div>
    <div id="progress-info" class="toast-info">{}</div>
    <div class="toast-actions">
      <button class="btn-action" onclick="location.href='action://cancel?id={}'">Cancel</button>
    </div>
  </div>
</body>
</html>"#, BASE_CSS, safe_name, pct, escape_html(&info_text), safe_id)
}

fn render_completed_html(filename: &str, dl_id: &str) -> String {
    let safe_name = escape_html(filename);
    let safe_id = escape_html(dl_id);

    format!(r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{}</style>
</head>
<body>
  <div class="toast-card">
    <div class="toast-header">
      <div class="toast-title-group">
        <svg class="toast-icon icon-completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <path d="M8 12l2.5 2.5L16 9"/>
        </svg>
        <span class="toast-title">Download Complete</span>
      </div>
      <button class="btn-close" onclick="location.href='action://close'" title="Dismiss">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="toast-filename">{}</div>
    <div class="toast-actions">
      <button class="btn-action" onclick="location.href='action://open?id={}'">Open</button>
      <button class="btn-action" onclick="location.href='action://show-folder?id={}'">Show in Folder</button>
    </div>
  </div>
</body>
</html>"#, BASE_CSS, safe_name, safe_id, safe_id)
}

fn render_failed_html(filename: &str, error_msg: &str) -> String {
    let safe_name = escape_html(filename);
    let safe_err = escape_html(error_msg);

    format!(r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{}</style>
</head>
<body>
  <div class="toast-card">
    <div class="toast-header">
      <div class="toast-title-group">
        <svg class="toast-icon icon-failed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span class="toast-title error">Download Failed</span>
      </div>
      <button class="btn-close" onclick="location.href='action://close'" title="Dismiss">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="toast-filename">{}: {}</div>
  </div>
</body>
</html>"#, BASE_CSS, safe_name, safe_err)
}

fn render_generic_html(title: &str, message: &str, n_type: &str, download_id: Option<&str>) -> String {
    let safe_title = escape_html(title);
    let safe_msg = escape_html(message);
    let is_error = n_type == "error";
    let is_success = n_type == "success";

    let (icon_class, title_class, icon_svg) = if is_error {
        ("icon-failed", "toast-title error", r#"<circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>"#)
    } else if is_success {
        ("icon-completed", "toast-title", r#"<circle cx="12" cy="12" r="10" stroke-width="2"/><path d="M8 12l2.5 2.5L16 9"/>"#)
    } else {
        ("icon-downloading", "toast-title", r#"<circle cx="12" cy="12" r="10" stroke-width="2"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>"#)
    };

    let actions_html = if let Some(id) = download_id {
        let safe_id = escape_html(id);
        format!(r#"<div class="toast-actions">
          <button class="btn-action" onclick="location.href='action://open?id={}'">Open</button>
          <button class="btn-action" onclick="location.href='action://show-folder?id={}'">Show in Folder</button>
        </div>"#, safe_id, safe_id)
    } else {
        String::new()
    };

    format!(r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>{}</style>
</head>
<body>
  <div class="toast-card">
    <div class="toast-header">
      <div class="toast-title-group">
        <svg class="toast-icon {}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          {}
        </svg>
        <span class="{}">{}</span>
      </div>
      <button class="btn-close" onclick="location.href='action://close'" title="Dismiss">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="toast-filename">{}</div>
    {}
  </div>
</body>
</html>"#, BASE_CSS, icon_class, icon_svg, title_class, safe_title, safe_msg, actions_html)
}

fn handle_toast_action(app: &AppHandle, uri: &str) {
    if let Ok(parsed) = url::Url::parse(uri) {
        let action = parsed.host_str().unwrap_or("");
        let query_id = parsed.query_pairs().find(|(k, _)| k == "id").map(|(_, v)| v.to_string());
        match action {
            "open" => {
                if let Some(id) = query_id {
                    let _ = crate::core::download::open_file_by_id(&id);
                }
                hide_notification_internal(app);
            }
            "show-folder" => {
                let dest = ACTIVE_TOAST.with(|cell| {
                    cell.borrow().as_ref().map(|a| a.cached_destination.clone()).unwrap_or_default()
                });
                let folder = if !dest.is_empty() {
                    Path::new(&dest).parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default()
                } else {
                    String::new()
                };
                let _ = crate::core::download::open_folder(&folder);
                hide_notification_internal(app);
            }
            "cancel" => {
                if let Some(id) = query_id {
                    let _ = crate::core::download::cancel_download_by_id(app, &id);
                }
                hide_notification_internal(app);
            }
            "close" => {
                hide_notification_internal(app);
            }
            _ => {
                hide_notification_internal(app);
            }
        }
    }
}

#[allow(deprecated)]
fn get_or_create_toast_webview(app: &AppHandle, layer: &gtk::Box) -> webkit2gtk::WebView {
    if let Some(existing) = ACTIVE_TOAST.with(|cell| {
        cell.borrow().as_ref().map(|s| s.webview.clone())
    }) {
        return existing;
    }

    if let Some(child) = layer.children().into_iter().find_map(|c| c.dynamic_cast::<webkit2gtk::WebView>().ok()) {
        return child;
    }

    let webview = webkit2gtk::WebView::new();
    webview.set_size_request(356, 136);
    let transparent = gtk::gdk::RGBA::new(0.0, 0.0, 0.0, 0.0);
    webview.set_background_color(&transparent);
    webview.connect_context_menu(|_, _, _, _| true);

    let app_action = app.clone();
    webview.connect_decide_policy(move |_wv, decision, decision_type| {
        if decision_type == webkit2gtk::PolicyDecisionType::NavigationAction {
            if let Some(nav_action) = decision.dynamic_cast_ref::<webkit2gtk::NavigationPolicyDecision>() {
                if let Some(uri) = nav_action.request().and_then(|r| r.uri()) {
                    let uri_str = uri.as_str();
                    if uri_str.starts_with("action://") {
                        decision.ignore();
                        handle_toast_action(&app_action, uri_str);
                        return true;
                    }
                }
            }
        }
        false
    });

    layer.pack_start(&webview, true, true, 0);
    webview.show_all();
    webview
}

fn start_auto_dismiss(app: &AppHandle, delay_secs: u32) {
    let epoch = DISMISS_EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
    let app_clone = app.clone();
    gtk::glib::timeout_add_seconds_local(delay_secs, move || {
        if DISMISS_EPOCH.load(Ordering::SeqCst) == epoch {
            hide_notification_internal(&app_clone);
        }
        gtk::glib::ControlFlow::Break
    });
}

fn hide_notification_internal(app: &AppHandle) {
    ACTIVE_TOAST.with(|cell| {
        *cell.borrow_mut() = None;
    });

    if let Some((_, layer)) = get_overlay_container(app) {
        layer.hide();
    }
}

pub fn hide_notification(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        hide_notification_internal(&app_handle);
    });
}

pub fn show_download_notification(app: &AppHandle, item: &DownloadItem) {
    let app_handle = app.clone();
    let item_clone = item.clone();

    let _ = app.run_on_main_thread(move || {
        let (overlay, layer) = match get_overlay_container(&app_handle) {
            Some(pair) => pair,
            None => return,
        };

        let webview = get_or_create_toast_webview(&app_handle, &layer);
        let html = render_downloading_html(
            &item_clone.filename,
            &item_clone.id,
            item_clone.received_bytes,
            item_clone.total_bytes,
            item_clone.progress,
        );
        webview.load_html(&html, None);

        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: Some(item_clone.id),
                cached_destination: item_clone.destination,
                last_update: Instant::now(),
                webview,
            });
        });
    });
}

#[allow(deprecated)]
pub fn update_download_progress(app: &AppHandle, item: &DownloadItem) {
    let app_handle = app.clone();
    let item_clone = item.clone();

    let _ = app.run_on_main_thread(move || {
        let mut needs_show = false;
        ACTIVE_TOAST.with(|cell| {
            let mut borrow = cell.borrow_mut();
            if let Some(active) = borrow.as_mut() {
                if active.download_id.as_deref() == Some(&item_clone.id) {
                    if active.last_update.elapsed().as_millis() >= 100 {
                        active.last_update = Instant::now();

                        let pct = (item_clone.progress.clamp(0.0, 1.0) * 100.0).round() as u32;
                        let info_text = if item_clone.total_bytes > 0 {
                            format!(
                                "{} / {} ({}%)",
                                format_file_size(item_clone.received_bytes),
                                format_file_size(item_clone.total_bytes),
                                pct
                            )
                        } else {
                            format!("Downloaded {}", format_file_size(item_clone.received_bytes))
                        };

                        let js_pct = pct;
                        let js_info = serde_json::to_string(&info_text).unwrap_or_else(|_| "\"\"".to_string());
                        let js_name = serde_json::to_string(&item_clone.filename).unwrap_or_else(|_| "\"\"".to_string());
                        let script = format!(
                            "if (window.updateProgress) window.updateProgress({}, {}, {});",
                            js_pct, js_info, js_name
                        );
                        active.webview.run_javascript(&script, None::<&gtk::gio::Cancellable>, |_| {});
                    }
                    return;
                }
            }
            needs_show = true;
        });

        if needs_show {
            show_download_notification(&app_handle, &item_clone);
        }
    });
}

pub fn show_download_completed(app: &AppHandle, item: &DownloadItem) {
    let app_handle = app.clone();
    let item_clone = item.clone();

    let _ = app.run_on_main_thread(move || {
        let (overlay, layer) = match get_overlay_container(&app_handle) {
            Some(pair) => pair,
            None => return,
        };

        let webview = get_or_create_toast_webview(&app_handle, &layer);
        let html = render_completed_html(&item_clone.filename, &item_clone.id);
        webview.load_html(&html, None);

        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: Some(item_clone.id),
                cached_destination: item_clone.destination,
                last_update: Instant::now(),
                webview,
            });
        });

        start_auto_dismiss(&app_handle, 6);
    });
}

pub fn show_download_failed(app: &AppHandle, item: &DownloadItem) {
    let app_handle = app.clone();
    let item_clone = item.clone();

    let _ = app.run_on_main_thread(move || {
        let (overlay, layer) = match get_overlay_container(&app_handle) {
            Some(pair) => pair,
            None => return,
        };

        let webview = get_or_create_toast_webview(&app_handle, &layer);
        let err_msg = item_clone.error.as_deref().unwrap_or("Network error");
        let html = render_failed_html(&item_clone.filename, err_msg);
        webview.load_html(&html, None);

        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: Some(item_clone.id),
                cached_destination: item_clone.destination,
                last_update: Instant::now(),
                webview,
            });
        });

        start_auto_dismiss(&app_handle, 6);
    });
}

pub fn show_notification(
    app: &AppHandle,
    title: &str,
    message: &str,
    n_type: &str,
    download_id: Option<&str>,
) {
    let app_handle = app.clone();
    let title_str = title.to_string();
    let msg_str = message.to_string();
    let n_type_str = n_type.to_string();
    let dl_id = download_id.map(|s| s.to_string());

    let _ = app.run_on_main_thread(move || {
        let (overlay, layer) = match get_overlay_container(&app_handle) {
            Some(pair) => pair,
            None => return,
        };

        let webview = get_or_create_toast_webview(&app_handle, &layer);
        let html = render_generic_html(&title_str, &msg_str, &n_type_str, dl_id.as_deref());
        webview.load_html(&html, None);

        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: dl_id,
                cached_destination: String::new(),
                last_update: Instant::now(),
                webview,
            });
        });

        start_auto_dismiss(&app_handle, 5);
    });
}
