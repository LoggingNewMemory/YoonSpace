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

use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};

use super::gtk_overlay;
use super::native_config::configure_native_webview;
use super::navigation::normalize_url;
use super::scripts::{get_favicon_observer_script, get_media_observer_script};
use super::split::{
    get_tab_split_ratio, set_tab_split_ratio, SingleViewRequest, SplitViewRequest,
    MAX_SPLIT_RATIO, MIN_SPLIT_RATIO,
};

static SPAWN_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, serde::Serialize)]
pub struct WebviewLoadProgressPayload {
    pub tab_id: String,
    pub progress: f64,
    pub status: String,
}

fn build_pane_webview(
    app: &AppHandle,
    webview_id: &str,
    shield_tab_id: &str,
    title_event: &'static str,
    split_pane: Option<&'static str>,
) -> Result<WebviewBuilder<tauri::Wry>, String> {
    let blank_url: url::Url = "about:blank"
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;
    let shield_script = crate::core::shield::get_shield_injection_script(webview_id);
    let media_script = get_media_observer_script(webview_id);
    let favicon_script = get_favicon_observer_script(webview_id);

    let app_title = app.clone();
    let app_load = app.clone();
    let progress_tab_id = webview_id.to_string();
    let root_tab_id = shield_tab_id.to_string();

    Ok(WebviewBuilder::new(webview_id, WebviewUrl::External(blank_url))
        .initialization_script(&shield_script)
        .initialization_script(&media_script)
        .initialization_script(&favicon_script)
        .on_document_title_changed(move |_webview, title| {
            if title == "about:blank" || title.is_empty() {
                return;
            }
            use tauri::Emitter;
            let _ = app_title.emit(title_event, title);
        })
        .on_page_load(move |webview, payload| {
            if payload.url().as_str() == "about:blank" {
                return;
            }
            use tauri::Emitter;
            let url_str = payload.url().as_str().to_string();

            if let Some(pane_name) = split_pane {
                #[derive(Clone, serde::Serialize)]
                struct SplitUrlPayload {
                    tab_id: String,
                    pane: String,
                    url: String,
                }
                let _ = app_load.emit(
                    "webview-split-url-changed",
                    SplitUrlPayload {
                        tab_id: root_tab_id.clone(),
                        pane: pane_name.to_string(),
                        url: url_str.clone(),
                    },
                );
            } else {
                #[derive(Clone, serde::Serialize)]
                struct UrlChangedPayload {
                    tab_id: String,
                    url: String,
                }
                let _ = app_load.emit(
                    "webview-url-changed",
                    UrlChangedPayload {
                        tab_id: root_tab_id.clone(),
                        url: url_str.clone(),
                    },
                );
            }

            if payload.event() == tauri::webview::PageLoadEvent::Started {
                let _ = app_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: progress_tab_id.clone(),
                        progress: 0.12,
                        status: "started".to_string(),
                    },
                );
                let (reset_tab, combined_breakdown) =
                    crate::core::shield::get_shield_manager().reset_tab(&root_tab_id);
                let _ = app_load.emit(
                    "shield-blocked-event",
                    crate::commands::shield::ShieldBlockEvent {
                        tab_id: reset_tab,
                        url: "reset".to_string(),
                        category: "reset".to_string(),
                        tab_count: combined_breakdown.total,
                        total_count: crate::core::shield::get_shield_manager()
                            .get_stats()
                            .total_blocked,
                        tab_breakdown: combined_breakdown,
                    },
                );
            }

            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let _ = app_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: progress_tab_id.clone(),
                        progress: 1.0,
                        status: "finished".to_string(),
                    },
                );
                crate::core::shield::inject_page_cosmetics(&webview, &root_tab_id, &url_str);
            }
        }))
}

pub fn spawn_single_view(app: &AppHandle, mut req: SingleViewRequest) -> Result<(), String> {
    let _guard = SPAWN_LOCK.lock().map_err(|e| e.to_string())?;
    req.url = normalize_url(&req.url);
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "single_view".to_string());

    let single_exists = app.get_webview(&tab_id).is_some();
    let is_attached = gtk_overlay::is_tab_view_attached(app, &tab_id);

    if single_exists && is_attached {
        if let Some(view) = app.get_webview(&tab_id) {
            let _ = view.set_position(LogicalPosition::new(req.bounds.x, req.bounds.y));
            let _ = view.set_size(LogicalSize::new(req.bounds.width, req.bounds.height));
        }
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
        return Ok(());
    }

    if let Some(view) = app.get_webview(&tab_id) {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview(&format!("{}_left", tab_id)) {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview(&format!("{}_right", tab_id)) {
        let _ = view.close();
    }

    gtk_overlay::hide_all_tab_views(app)?;

    let target_url: url::Url = req.url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let builder = build_pane_webview(app, &tab_id, &tab_id, "webview-title-changed", None)?;

    let single_view = window
        .add_child(
            builder,
            LogicalPosition::new(req.bounds.x, req.bounds.y),
            LogicalSize::new(req.bounds.width, req.bounds.height),
        )
        .map_err(|e| e.to_string())?;

    configure_native_webview(app, &single_view, &tab_id);
    gtk_overlay::attach_single_view(app, &tab_id, req.bounds)?;

    let single_clone = single_view.clone();
    gtk::glib::idle_add_local(move || {
        let _ = single_clone.navigate(target_url.clone());
        gtk::glib::ControlFlow::Break
    });

    Ok(())
}

pub fn spawn_split_views(app: &AppHandle, mut req: SplitViewRequest) -> Result<(), String> {
    let _guard = SPAWN_LOCK.lock().map_err(|e| e.to_string())?;
    req.left_url = normalize_url(&req.left_url);
    req.right_url = normalize_url(&req.right_url);
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "split_view".to_string());
    let left_label = format!("{}_left", tab_id);
    let right_label = format!("{}_right", tab_id);

    let left_exists = app.get_webview(&left_label).is_some();
    let right_exists = app.get_webview(&right_label).is_some();

    let is_attached = gtk_overlay::is_tab_view_attached(app, &tab_id);

    let ratio = req
        .bounds
        .split_ratio
        .unwrap_or_else(|| get_tab_split_ratio(&tab_id))
        .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
    req.bounds.split_ratio = Some(ratio);
    set_tab_split_ratio(&tab_id, ratio);

    let left_width = req.bounds.left_width();
    let right_width = req.bounds.right_width();
    let height = req.bounds.height;
    let top_y = req.bounds.y;
    let left_x = req.bounds.left_x();
    let right_x = req.bounds.right_x();

    if left_exists && right_exists && is_attached {
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
        return Ok(());
    }

    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview(&tab_id) {
        let _ = view.close();
    }

    gtk_overlay::hide_all_tab_views(app)?;

    let target_left_url: url::Url = req
        .left_url
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;
    let target_right_url: url::Url = req
        .right_url
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    let left_builder = build_pane_webview(
        app,
        &left_label,
        &tab_id,
        "webview-split-left-title-changed",
        Some("left"),
    )?;
    let right_builder = build_pane_webview(
        app,
        &right_label,
        &tab_id,
        "webview-split-right-title-changed",
        Some("right"),
    )?;

    let left_webview = window
        .add_child(
            left_builder,
            LogicalPosition::new(left_x, top_y),
            LogicalSize::new(left_width, height),
        )
        .map_err(|e| e.to_string())?;

    let right_webview = window
        .add_child(
            right_builder,
            LogicalPosition::new(right_x, top_y),
            LogicalSize::new(right_width, height),
        )
        .map_err(|e| e.to_string())?;

    configure_native_webview(app, &left_webview, &left_label);
    configure_native_webview(app, &right_webview, &right_label);
    gtk_overlay::attach_split_views(app, &tab_id, &left_label, &right_label, req.bounds)?;

    let left_clone = left_webview.clone();
    let left_url_clone = target_left_url.clone();
    let right_clone = right_webview.clone();
    let right_url_clone = target_right_url.clone();

    // Idle-navigate panes once GTK finishes mapping the split overlay
    gtk::glib::idle_add_local(move || {
        let _ = left_clone.navigate(left_url_clone.clone());
        let _ = right_clone.navigate(right_url_clone.clone());
        gtk::glib::ControlFlow::Break
    });

    Ok(())
}
