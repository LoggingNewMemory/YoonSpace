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

use tauri::{AppHandle, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "linux")]
pub mod gtk_overlay {
    use gtk::prelude::*;
    use tauri::{AppHandle, Manager};
    use crate::core::webview::SplitBounds;

    pub fn ensure_overlay(app: &AppHandle) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                let children = vbox.children();
                let has_overlay = children.iter().any(|c| c.is::<gtk::Overlay>());
                if !has_overlay && !children.is_empty() {
                    let main_widget = &children[0];
                    let overlay = gtk::Overlay::new();
                    vbox.remove(main_widget);
                    overlay.add(main_widget);
                    vbox.pack_start(&overlay, true, true, 0);
                    overlay.show_all();
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn attach_single_view(app: &AppHandle, tab_id: &str, bounds: SplitBounds) -> Result<(), String> {
        ensure_overlay(app)?;
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let tab_id = tab_id.to_string();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                let overlay = vbox.children()
                    .into_iter()
                    .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
                    .ok_or("Overlay not found in vbox")?;

                let main_child = overlay.child();
                // Hide other tab overlays and remove any stale widget with the same tab_id
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        if child.widget_name().as_str() == tab_id.as_str() {
                            overlay.remove(&child);
                        } else {
                            child.hide();
                        }
                    }
                }

                let other_children: Vec<gtk::Widget> = vbox.children()
                    .into_iter()
                    .filter(|c| c != &overlay)
                    .collect();

                for child in other_children {
                    vbox.remove(&child);
                    child.set_widget_name(&tab_id);
                    child.set_margin_start(bounds.x as i32);
                    child.set_margin_top(bounds.y as i32);
                    let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                    let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                    let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                    child.set_margin_end(margin_end);
                    child.set_halign(gtk::Align::Fill);
                    child.set_valign(gtk::Align::Fill);
                    child.set_hexpand(true);
                    child.set_vexpand(true);
                    overlay.add_overlay(&child);
                    child.show_all();
                    child.show();
                    child.queue_resize();
                    child.queue_draw();
                    child.set_no_show_all(true);
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn is_tab_view_attached(app: &AppHandle, tab_id: &str) -> bool {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let tab_id = tab_id.to_string();
        let _ = app.run_on_main_thread(move || {
            let res = (|| -> bool {
                let window = match app_handle.get_window("main") {
                    Some(w) => w,
                    None => return false,
                };
                let vbox = match window.default_vbox() {
                    Ok(v) => v,
                    Err(_) => return false,
                };
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) && child.widget_name().as_str() == tab_id.as_str() {
                            return true;
                        }
                    }
                }
                false
            })();
            let _ = tx.send(res);
        });
        rx.recv().unwrap_or(false)
    }

    pub fn attach_split_views(
        app: &AppHandle,
        tab_id: &str,
        left_label: &str,
        right_label: &str,
        bounds: SplitBounds,
    ) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let tab_id = tab_id.to_string();
        let left_label = left_label.to_string();
        let right_label = right_label.to_string();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;

                // 1. Ensure overlay container exists
                let children = vbox.children();
                let has_overlay = children.iter().any(|c| c.is::<gtk::Overlay>());
                if !has_overlay && !children.is_empty() {
                    let main_widget = &children[0];
                    let overlay = gtk::Overlay::new();
                    vbox.remove(main_widget);
                    overlay.add(main_widget);
                    vbox.pack_start(&overlay, true, true, 0);
                    overlay.show_all();
                }

                let overlay = vbox.children()
                    .into_iter()
                    .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
                    .ok_or("Overlay not found in vbox")?;

                let main_child = overlay.child();

                // 2. Hide other tab overlays and remove any stale widget with the same tab_id
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        if child.widget_name().as_str() == tab_id.as_str() {
                            overlay.remove(&child);
                        } else {
                            child.hide();
                        }
                    }
                }

                // 3. Extract the newly spawned child webviews from vbox
                let new_children: Vec<gtk::Widget> = vbox.children()
                    .into_iter()
                    .filter(|c| c != &overlay)
                    .collect();

                for child in &new_children {
                    vbox.remove(child);
                }

                // 4. Distinguish left and right by widget name or order
                let mut left_widget: Option<gtk::Widget> = None;
                let mut right_widget: Option<gtk::Widget> = None;
                let mut remaining_widgets = Vec::new();

                for child in new_children {
                    let name = child.widget_name();
                    if name.as_str() == left_label.as_str() {
                        left_widget = Some(child);
                    } else if name.as_str() == right_label.as_str() {
                        right_widget = Some(child);
                    } else {
                        remaining_widgets.push(child);
                    }
                }

                if left_widget.is_none() && !remaining_widgets.is_empty() {
                    left_widget = Some(remaining_widgets.remove(0));
                }
                if right_widget.is_none() && !remaining_widgets.is_empty() {
                    right_widget = Some(remaining_widgets.remove(0));
                }

                let split_box = gtk::Box::new(gtk::Orientation::Horizontal, 0);
                split_box.set_widget_name(&tab_id);
                split_box.set_homogeneous(true);

                if let Some(left) = &left_widget {
                    left.set_widget_name(&left_label);
                    left.set_halign(gtk::Align::Fill);
                    left.set_valign(gtk::Align::Fill);
                    left.set_hexpand(true);
                    left.set_vexpand(true);
                    split_box.pack_start(left, true, true, 0);
                }
                if let Some(right) = &right_widget {
                    right.set_widget_name(&right_label);
                    right.set_halign(gtk::Align::Fill);
                    right.set_valign(gtk::Align::Fill);
                    right.set_hexpand(true);
                    right.set_vexpand(true);
                    split_box.pack_start(right, true, true, 0);
                }

                split_box.set_margin_start(bounds.x as i32);
                split_box.set_margin_top(bounds.y as i32);
                let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                split_box.set_margin_end(margin_end);
                split_box.set_halign(gtk::Align::Fill);
                split_box.set_valign(gtk::Align::Fill);
                split_box.set_hexpand(true);
                split_box.set_vexpand(true);

                overlay.add_overlay(&split_box);

                if let Some(left) = &left_widget {
                    left.show_all();
                    left.show();
                }
                if let Some(right) = &right_widget {
                    right.show_all();
                    right.show();
                }
                split_box.show_all();
                split_box.show();
                split_box.queue_resize();
                split_box.queue_draw();
                split_box.set_no_show_all(true);

                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn activate_tab_view(app: &AppHandle, tab_id: &str, bounds: SplitBounds) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let tab_id = tab_id.to_string();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            if child.widget_name().as_str() == tab_id.as_str() {
                                child.set_margin_start(bounds.x as i32);
                                child.set_margin_top(bounds.y as i32);
                                let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                                let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                                let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                                child.set_margin_end(margin_end);
                                if let Ok(container) = child.clone().dynamic_cast::<gtk::Container>() {
                                    for c in container.children() {
                                        c.show_all();
                                        c.show();
                                    }
                                }
                                child.show_all();
                                child.show();
                                child.queue_resize();
                                child.queue_draw();
                            } else {
                                child.hide();
                            }
                        }
                    }
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn hide_all_tab_views(app: &AppHandle) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            child.hide();
                        }
                    }
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn remove_tab_view(app: &AppHandle, tab_id: &str) -> Result<bool, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let tab_id = tab_id.to_string();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<bool, String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                let mut remaining_tabs = 0;
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            if child.widget_name().as_str() == tab_id.as_str() {
                                overlay.remove(&child);
                            } else {
                                remaining_tabs += 1;
                            }
                        }
                    }
                }
                Ok(remaining_tabs > 0)
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn has_any_overlay(app: &AppHandle) -> bool {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let res = (|| -> bool {
                let window = match app_handle.get_window("main") {
                    Some(w) => w,
                    None => return false,
                };
                let vbox = match window.default_vbox() {
                    Ok(v) => v,
                    Err(_) => return false,
                };
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            return true;
                        }
                    }
                }
                false
            })();
            let _ = tx.send(res);
        });
        rx.recv().unwrap_or(false)
    }

    pub fn update_overlay_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                    let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                    let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            child.set_margin_start(bounds.x as i32);
                            child.set_margin_top(bounds.y as i32);
                            child.set_margin_end(margin_end);
                            child.queue_resize();
                        }
                    }
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn cleanup_overlay(app: &AppHandle) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                    let main_child = overlay.child();
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            overlay.remove(&child);
                        }
                    }
                }
                for child in vbox.children() {
                    if !child.is::<gtk::Overlay>() {
                        vbox.remove(&child);
                    }
                }
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }
}

#[cfg(target_os = "linux")]
pub fn init_gtk_overlay(app: &AppHandle) -> Result<(), String> {
    gtk::glib::log_set_default_handler(|log_domain, log_level, message| {
        if message.contains("WEBKIT_HARDWARE_ACCELERATION_POLICY_ON_DEMAND") {
            return;
        }
        gtk::glib::log_default_handler(log_domain, log_level, Some(message));
    });
    gtk_overlay::ensure_overlay(app)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitViewRequest {
    pub tab_id: Option<String>,
    pub left_url: String,
    pub right_url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleViewRequest {
    pub tab_id: Option<String>,
    pub url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SplitBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn normalize_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return raw.to_string();
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("https://{}", trimmed)
    } else if trimmed.starts_with("http://") {
        let manager = crate::core::shield::get_shield_manager();
        if manager.is_upgrade_https()
            && !trimmed.starts_with("http://localhost")
            && !trimmed.starts_with("http://127.0.0.1")
        {
            format!("https://{}", &trimmed[7..])
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    }
}

#[cfg(target_os = "linux")]
fn configure_native_webview(app: &AppHandle, webview: &tauri::Webview, tab_id: &str) {
    use webkit2gtk::{PolicyDecisionExt, SettingsExt, WebViewExt, URIRequestExt, WebResourceExt, UserContentManagerExt};
    let app_handle = app.clone();
    let tab_id_str = tab_id.to_string();

    let _ = webview.with_webview(move |platform_webview| {
        let inner_wv = platform_webview.inner();
        inner_wv.set_widget_name(&tab_id_str);

        // 1. Optimize WebKitGTK settings for unrestricted media playback & modern web
        if let Some(settings) = WebViewExt::settings(&inner_wv) {
            settings.set_media_playback_requires_user_gesture(false);
            settings.set_media_playback_allows_inline(true);
            settings.set_enable_encrypted_media(true);
            settings.set_enable_media(true);
            settings.set_enable_mediasource(true);
            settings.set_enable_media_stream(true);
            settings.set_enable_media_capabilities(true);
            settings.set_enable_webaudio(true);
            settings.set_enable_webgl(true);
            settings.set_enable_smooth_scrolling(true);
            settings.set_hardware_acceleration_policy(webkit2gtk::HardwareAccelerationPolicy::OnDemand);
        }

        // 2. Unblock autoplay policy & filter popup ad windows via Brave adblock-rust
        let app_popup = app_handle.clone();
        let tab_id_popup = tab_id_str.clone();
        inner_wv.connect_decide_policy(move |_wv, decision, decision_type| {
            if decision_type == webkit2gtk::PolicyDecisionType::NewWindowAction {
                use gtk::prelude::Cast;
                use webkit2gtk::{NavigationPolicyDecisionExt, URIRequestExt};
                if let Some(nav_action) = decision.dynamic_cast_ref::<webkit2gtk::NavigationPolicyDecision>() {
                    #[allow(deprecated)]
                    let req_opt = nav_action.navigation_action().and_then(|na| na.request()).or_else(|| nav_action.request());
                    if let Some(req) = req_opt {
                        if let Some(uri) = req.uri() {
                            let manager = crate::core::shield::get_shield_manager();
                            if manager.is_enabled() {
                                let (should_block, category) = manager.check_url_categorized(uri.as_str(), "", "subdocument");
                                if should_block {
                                    decision.ignore();
                                    crate::commands::shield::record_and_emit_block(
                                        &app_popup,
                                        &tab_id_popup,
                                        uri.as_str(),
                                        Some(category),
                                        1,
                                    );
                                    return true;
                                }
                            }
                        }
                    }
                }
            }

            if decision_type == webkit2gtk::PolicyDecisionType::NavigationAction
                || decision_type == webkit2gtk::PolicyDecisionType::NewWindowAction
            {
                let policies = webkit2gtk::WebsitePolicies::builder()
                    .autoplay(webkit2gtk::AutoplayPolicy::Allow)
                    .build();
                decision.use_with_policies(&policies);
                return true;
            }
            false
        });

        // 3. Subresource blocking & HTTPS upgrade at the WebKitGTK network boundary
        let app_resource = app_handle.clone();
        let tab_id_resource = tab_id_str.clone();
        inner_wv.connect_resource_load_started(move |wv, web_resource, req| {
            let manager = crate::core::shield::get_shield_manager();
            if !manager.is_enabled() {
                return;
            }
            if let Some(uri) = req.uri() {
                let uri_str = uri.as_str();
                if uri_str.starts_with("http://") || uri_str.starts_with("https://") {
                    // HTTPS upgrading
                    if manager.is_upgrade_https()
                        && uri_str.starts_with("http://")
                        && !uri_str.starts_with("http://localhost")
                        && !uri_str.starts_with("http://127.0.0.1")
                    {
                        let upgraded = format!("https://{}", &uri_str[7..]);
                        req.set_uri(&upgraded);
                    }

                    let page_url = wv.uri().map(|u| u.to_string()).unwrap_or_default();
                    let res_uri = web_resource.uri().map(|u| u.to_string()).unwrap_or_default();

                    // Do not block top-level main frame navigation
                    if !page_url.is_empty() && (uri_str == page_url || res_uri == page_url) {
                        return;
                    }

                    let (should_block, category) = manager.check_url_categorized(uri_str, &page_url, "other");
                    if should_block {
                        req.set_uri("about:blank");
                        crate::commands::shield::record_and_emit_block(
                            &app_resource,
                            &tab_id_resource,
                            uri_str,
                            Some(category),
                            1,
                        );
                    }
                }
            }
        });

        // 4. Script message handler for in-page blocks & cosmetic elements
        if let Some(ucm) = inner_wv.user_content_manager() {
            let app_msg = app_handle.clone();
            let tab_id_msg = tab_id_str.clone();
            ucm.connect_script_message_received(Some("shield_block"), move |_ucm, js_res| {
                if let Some(js_val) = js_res.js_value() {
                    use javascriptcore::ValueExt;
                    let msg_str = js_val.to_str();
                    #[derive(serde::Deserialize)]
                    struct ScriptBlockPayload {
                        #[serde(rename = "tabId")]
                        tab_id: Option<String>,
                        url: Option<String>,
                        category: Option<String>,
                        count: Option<u64>,
                    }
                    if let Ok(payload) = serde_json::from_str::<ScriptBlockPayload>(msg_str.as_str()) {
                        let target_tab = payload.tab_id.as_deref().unwrap_or(&tab_id_msg);
                        let target_url = payload.url.as_deref().unwrap_or("shield-block");
                        let override_cat = payload.category.as_deref().and_then(|c| match c.to_lowercase().as_str() {
                            "tracker" => Some(crate::core::shield::ShieldCategory::Tracker),
                            "miner" => Some(crate::core::shield::ShieldCategory::Miner),
                            "ad" => Some(crate::core::shield::ShieldCategory::Ad),
                            _ => None,
                        });
                        let count = payload.count.unwrap_or(1);
                        crate::commands::shield::record_and_emit_block(
                            &app_msg,
                            target_tab,
                            target_url,
                            override_cat,
                            count,
                        );
                    }
                }
            });
            let _ = ucm.register_script_message_handler("shield_block");
        }

        // 5. Load interruption recovery
        let last_interrupted = std::sync::Arc::new(std::sync::Mutex::new(String::new()));

        let last_clone = last_interrupted.clone();
        inner_wv.connect_load_changed(move |_wv, event| {
            if event == webkit2gtk::LoadEvent::Finished {
                if let Ok(mut last) = last_clone.lock() {
                    last.clear();
                }
            }
        });

        inner_wv.connect_load_failed(move |wv, _event, failing_uri, error| {
            if error.matches(webkit2gtk::PolicyError::FrameLoadInterruptedByPolicyChange)
                || error.message().contains("interrupted")
            {
                if !failing_uri.is_empty()
                    && failing_uri != "about:blank"
                    && !failing_uri.starts_with("data:")
                {
                    let is_main_frame = wv.uri().map(|u| u.as_str() == failing_uri).unwrap_or(false);
                    if is_main_frame {
                        let mut last = last_interrupted.lock().unwrap();
                        if *last != failing_uri {
                            *last = failing_uri.to_string();
                            let target_uri = failing_uri.to_string();
                            let wv_clone = wv.clone();
                            gtk::glib::idle_add_local(move || {
                                wv_clone.load_uri(&target_uri);
                                gtk::glib::ControlFlow::Break
                            });
                            return true;
                        }
                    }
                }
            }
            false
        });

        // 6. Native keyboard navigation shortcuts: Reload (Ctrl+R / F5), Back (Alt+Left), Forward (Alt+Right)
        use gtk::prelude::WidgetExt;
        inner_wv.connect_key_press_event(|wv, event| {
            use gtk::gdk;
            let state = event.state();
            let is_ctrl = state.contains(gdk::ModifierType::CONTROL_MASK);
            let is_alt = state.contains(gdk::ModifierType::MOD1_MASK);

            if let Some(name) = event.keyval().name() {
                let name_str = name.as_str();
                // 1. Reload: Ctrl+R or F5
                if (is_ctrl && (name_str == "r" || name_str == "R")) || name_str == "F5" {
                    wv.reload();
                    return gtk::glib::Propagation::Stop;
                }
                // 2. Back: Alt+Left
                if is_alt && (name_str == "Left" || name_str == "KP_Left") {
                    if wv.can_go_back() {
                        wv.go_back();
                    }
                    return gtk::glib::Propagation::Stop;
                }
                // 3. Forward: Alt+Right
                if is_alt && (name_str == "Right" || name_str == "KP_Right") {
                    if wv.can_go_forward() {
                        wv.go_forward();
                    }
                    return gtk::glib::Propagation::Stop;
                }
            }
            gtk::glib::Propagation::Proceed
        });
    });
}

pub fn spawn_single_view(app: &AppHandle, mut req: SingleViewRequest) -> Result<(), String> {
    req.url = normalize_url(&req.url);
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "single_view".to_string());

    let single_exists = app.get_webview(&tab_id).is_some();
    #[cfg(target_os = "linux")]
    let is_attached = gtk_overlay::is_tab_view_attached(app, &tab_id);
    #[cfg(not(target_os = "linux"))]
    let is_attached = true;

    if single_exists && is_attached {
        if let Some(view) = app.get_webview(&tab_id) {
            let _ = view.set_position(LogicalPosition::new(req.bounds.x, req.bounds.y));
            let _ = view.set_size(LogicalSize::new(req.bounds.width, req.bounds.height));
        }
        #[cfg(target_os = "linux")]
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
        return Ok(());
    }

    if let Some(view) = app.get_webview(&tab_id) {
        let _ = view.close();
    }

    #[cfg(target_os = "linux")]
    gtk_overlay::hide_all_tab_views(app)?;

    let target_url: url::Url = req.url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let blank_url: url::Url = "about:blank".parse().map_err(|e: url::ParseError| e.to_string())?;
    let app_title = app.clone();
    let app_load = app.clone();
    let tab_id_load = tab_id.clone();
    let shield_script = crate::core::shield::get_shield_injection_script(&tab_id);
    let builder = WebviewBuilder::new(&tab_id, WebviewUrl::External(blank_url))
        .initialization_script(&shield_script)
        .on_document_title_changed(move |_webview, title| {
            if title == "about:blank" || title.is_empty() {
                return;
            }
            use tauri::Emitter;
            let _ = app_title.emit("webview-title-changed", title);
        })
        .on_page_load(move |webview, payload| {
            if payload.url().as_str() == "about:blank" {
                return;
            }
            use tauri::Emitter;
            #[derive(Clone, serde::Serialize)]
            struct UrlChangedPayload {
                tab_id: String,
                url: String,
            }
            let _ = app_load.emit("webview-url-changed", UrlChangedPayload {
                tab_id: tab_id_load.clone(),
                url: payload.url().as_str().to_string(),
            });

            if payload.event() == tauri::webview::PageLoadEvent::Started {
                crate::core::shield::get_shield_manager().reset_tab(&tab_id_load);
            }

            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                crate::core::shield::inject_page_cosmetics(&webview, &tab_id_load, payload.url().as_str());
            }
        });

    let single_view = window.add_child(
        builder,
        LogicalPosition::new(req.bounds.x, req.bounds.y),
        LogicalSize::new(req.bounds.width, req.bounds.height),
    ).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        configure_native_webview(app, &single_view, &tab_id);
        gtk_overlay::attach_single_view(app, &tab_id, req.bounds)?;
    }

    single_view.navigate(target_url).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn spawn_split_views(app: &AppHandle, mut req: SplitViewRequest) -> Result<(), String> {
    req.left_url = normalize_url(&req.left_url);
    req.right_url = normalize_url(&req.right_url);
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "split_view".to_string());
    let left_label = format!("{}_left", tab_id);
    let right_label = format!("{}_right", tab_id);

    let left_exists = app.get_webview(&left_label).is_some();
    let right_exists = app.get_webview(&right_label).is_some();

    #[cfg(target_os = "linux")]
    let is_attached = gtk_overlay::is_tab_view_attached(app, &tab_id);
    #[cfg(not(target_os = "linux"))]
    let is_attached = true;

    if left_exists && right_exists && is_attached {
        let half_width = req.bounds.width / 2.0;
        let height = req.bounds.height;
        let top_y = req.bounds.y;
        let left_x = req.bounds.x;
        let right_x = req.bounds.x + half_width;

        if let Some(left) = app.get_webview(&left_label) {
            let _ = left.set_position(LogicalPosition::new(left_x, top_y));
            let _ = left.set_size(LogicalSize::new(half_width, height));
        }
        if let Some(right) = app.get_webview(&right_label) {
            let _ = right.set_position(LogicalPosition::new(right_x, top_y));
            let _ = right.set_size(LogicalSize::new(half_width, height));
        }

        #[cfg(target_os = "linux")]
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;

        return Ok(());
    }

    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.close();
    }

    #[cfg(target_os = "linux")]
    gtk_overlay::hide_all_tab_views(app)?;

    let half_width = req.bounds.width / 2.0;
    let height = req.bounds.height;
    let top_y = req.bounds.y;
    let left_x = req.bounds.x;
    let right_x = req.bounds.x + half_width;

    let target_left_url: url::Url = req.left_url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let target_right_url: url::Url = req.right_url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let blank_url: url::Url = "about:blank".parse().map_err(|e: url::ParseError| e.to_string())?;

    let app_left = app.clone();
    let app_left_load = app.clone();
    let tab_id_left = tab_id.clone();
    let left_shield = crate::core::shield::get_shield_injection_script(&left_label);
    let left_builder = WebviewBuilder::new(&left_label, WebviewUrl::External(blank_url.clone()))
        .initialization_script(&left_shield)
        .on_document_title_changed(move |_webview, title| {
            if title == "about:blank" || title.is_empty() {
                return;
            }
            use tauri::Emitter;
            let _ = app_left.emit("webview-split-left-title-changed", title);
        })
        .on_page_load(move |webview, payload| {
            if payload.url().as_str() == "about:blank" {
                return;
            }
            use tauri::Emitter;
            #[derive(Clone, serde::Serialize)]
            struct SplitUrlPayload {
                tab_id: String,
                pane: String,
                url: String,
            }
            let _ = app_left_load.emit("webview-split-url-changed", SplitUrlPayload {
                tab_id: tab_id_left.clone(),
                pane: "left".to_string(),
                url: payload.url().as_str().to_string(),
            });

            if payload.event() == tauri::webview::PageLoadEvent::Started {
                crate::core::shield::get_shield_manager().reset_tab(&tab_id_left);
            }

            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                crate::core::shield::inject_page_cosmetics(&webview, &tab_id_left, payload.url().as_str());
            }
        });

    let app_right = app.clone();
    let app_right_load = app.clone();
    let tab_id_right = tab_id.clone();
    let right_shield = crate::core::shield::get_shield_injection_script(&right_label);
    let right_builder = WebviewBuilder::new(&right_label, WebviewUrl::External(blank_url))
        .initialization_script(&right_shield)
        .on_document_title_changed(move |_webview, title| {
            if title == "about:blank" || title.is_empty() {
                return;
            }
            use tauri::Emitter;
            let _ = app_right.emit("webview-split-right-title-changed", title);
        })
        .on_page_load(move |webview, payload| {
            if payload.url().as_str() == "about:blank" {
                return;
            }
            use tauri::Emitter;
            #[derive(Clone, serde::Serialize)]
            struct SplitUrlPayload {
                tab_id: String,
                pane: String,
                url: String,
            }
            let _ = app_right_load.emit("webview-split-url-changed", SplitUrlPayload {
                tab_id: tab_id_right.clone(),
                pane: "right".to_string(),
                url: payload.url().as_str().to_string(),
            });

            if payload.event() == tauri::webview::PageLoadEvent::Started {
                crate::core::shield::get_shield_manager().reset_tab(&tab_id_right);
            }

            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                crate::core::shield::inject_page_cosmetics(&webview, &tab_id_right, payload.url().as_str());
            }
        });

    let left_webview = window.add_child(
        left_builder,
        LogicalPosition::new(left_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    let right_webview = window.add_child(
        right_builder,
        LogicalPosition::new(right_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        configure_native_webview(app, &left_webview, &left_label);
        configure_native_webview(app, &right_webview, &right_label);
        gtk_overlay::attach_split_views(app, &tab_id, &left_label, &right_label, req.bounds)?;
    }

    left_webview.navigate(target_left_url).map_err(|e| e.to_string())?;
    right_webview.navigate(target_right_url).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn update_split_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
    let half_width = bounds.width / 2.0;
    let height = bounds.height;
    let top_y = bounds.y;
    let left_x = bounds.x;
    let right_x = bounds.x + half_width;

    for (label, view) in app.webviews() {
        if label == "main" {
            continue;
        }
        if label.ends_with("_left") {
            let _ = view.set_position(LogicalPosition::new(left_x, top_y));
            let _ = view.set_size(LogicalSize::new(half_width, height));
        } else if label.ends_with("_right") {
            let _ = view.set_position(LogicalPosition::new(right_x, top_y));
            let _ = view.set_size(LogicalSize::new(half_width, height));
        } else {
            let _ = view.set_position(LogicalPosition::new(bounds.x, bounds.y));
            let _ = view.set_size(LogicalSize::new(bounds.width, bounds.height));
        }
    }

    #[cfg(target_os = "linux")]
    let _ = gtk_overlay::update_overlay_bounds(app, bounds);

    Ok(())
}

pub fn navigate_split_view(app: &AppHandle, pane: &str, target_url: &str) -> Result<(), String> {
    let normalized = normalize_url(target_url);
    let parsed: url::Url = normalized.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(view) = app.get_webview(pane) {
        view.navigate(parsed).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let target_label = match pane {
        "single" => "single_view".to_string(),
        "left" => "split_left".to_string(),
        "right" => "split_right".to_string(),
        other => other.to_string(),
    };

    if let Some(view) = app.get_webview(&target_label) {
        view.navigate(parsed).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if pane == "left" || pane == "right" {
        let suffix = format!("_{}", pane);
        for (label, view) in app.webviews() {
            if label.ends_with(&suffix) {
                view.navigate(parsed).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
    }

    Err(format!("Webview '{}' not active", pane))
}

pub fn navigate_tab_view(app: &AppHandle, target: &str, target_url: &str) -> Result<(), String> {
    let normalized = normalize_url(target_url);
    let parsed: url::Url = normalized.parse().map_err(|e: url::ParseError| e.to_string())?;
    if let Some(view) = app.get_webview(target) {
        view.navigate(parsed).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let left_label = format!("{}_left", target);
    if let Some(view) = app.get_webview(&left_label) {
        view.navigate(parsed).map_err(|e| e.to_string())?;
        return Ok(());
    }
    Err(format!("Webview '{}' not found", target))
}

pub fn webview_go_back(app: &AppHandle, target: &str) -> Result<(), String> {
    if let Some(view) = app.get_webview(target) {
        let _ = view.eval("window.history.back()");
        return Ok(());
    }
    let left_label = format!("{}_left", target);
    let right_label = format!("{}_right", target);
    let mut found = false;
    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.eval("window.history.back()");
        found = true;
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.eval("window.history.back()");
        found = true;
    }
    if found {
        return Ok(());
    }
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.eval("window.history.back()");
        return Ok(());
    }
    let suffix = format!("_{}", target);
    for (label, view) in app.webviews() {
        if label.ends_with(&suffix) {
            let _ = view.eval("window.history.back()");
            return Ok(());
        }
    }
    Err(format!("Webview '{}' not found", target))
}

pub fn webview_go_forward(app: &AppHandle, target: &str) -> Result<(), String> {
    if let Some(view) = app.get_webview(target) {
        let _ = view.eval("window.history.forward()");
        return Ok(());
    }
    let left_label = format!("{}_left", target);
    let right_label = format!("{}_right", target);
    let mut found = false;
    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.eval("window.history.forward()");
        found = true;
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.eval("window.history.forward()");
        found = true;
    }
    if found {
        return Ok(());
    }
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.eval("window.history.forward()");
        return Ok(());
    }
    let suffix = format!("_{}", target);
    for (label, view) in app.webviews() {
        if label.ends_with(&suffix) {
            let _ = view.eval("window.history.forward()");
            return Ok(());
        }
    }
    Err(format!("Webview '{}' not found", target))
}

pub fn webview_reload(app: &AppHandle, target: &str) -> Result<(), String> {
    if let Some(view) = app.get_webview(target) {
        let _ = view.eval("window.location.reload()");
        return Ok(());
    }
    let left_label = format!("{}_left", target);
    let right_label = format!("{}_right", target);
    let mut found = false;
    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if found {
        return Ok(());
    }
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if let Some(view) = app.get_webview("split_right") {
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if found {
        Ok(())
    } else {
        Err(format!("Webview '{}' not found", target))
    }
}

#[cfg(target_os = "linux")]
unsafe extern "C" {
    fn malloc_trim(pad: usize) -> i32;
}

pub fn is_split_active(app: &AppHandle) -> bool {
    #[cfg(target_os = "linux")]
    {
        gtk_overlay::has_any_overlay(app)
    }
    #[cfg(not(target_os = "linux"))]
    {
        app.get_webview("single_view").is_some() ||
        app.get_webview("split_left").is_some() ||
        app.get_webview("split_right").is_some()
    }
}

pub fn hide_all_webviews(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    gtk_overlay::hide_all_tab_views(app)?;
    Ok(())
}

pub fn close_tab_view(app: &AppHandle, tab_id: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let has_remaining = gtk_overlay::remove_tab_view(app, tab_id)?;

    if let Some(view) = app.get_webview(tab_id) {
        let _ = view.close();
    }
    if let Some(left) = app.get_webview(&format!("{}_left", tab_id)) {
        let _ = left.close();
    }
    if let Some(right) = app.get_webview(&format!("{}_right", tab_id)) {
        let _ = right.close();
    }
    if tab_id == "single_view" {
        if let Some(view) = app.get_webview("single_view") {
            let _ = view.close();
        }
    }

    #[cfg(target_os = "linux")]
    if !has_remaining {
        use webkit2gtk::WebContextExt;
        if let Some(context) = webkit2gtk::WebContext::default() {
            context.clear_cache();
        }
        unsafe {
            malloc_trim(0);
        }
    }

    Ok(())
}

pub fn close_split_views(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let _ = gtk_overlay::cleanup_overlay(app);

    for (label, webview) in app.webviews() {
        if label != "main" {
            let _ = webview.close();
        }
    }

    #[cfg(target_os = "linux")]
    {
        use webkit2gtk::WebContextExt;
        if let Some(context) = webkit2gtk::WebContext::default() {
            context.clear_cache();
        }
        unsafe {
            malloc_trim(0);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_bounds_calculations() {
        let bounds = SplitBounds {
            x: 64.0,
            y: 108.0,
            width: 1200.0,
            height: 800.0,
        };

        let half_width = bounds.width / 2.0;
        let left_x = bounds.x;
        let right_x = bounds.x + half_width;

        assert_eq!(half_width, 600.0);
        assert_eq!(left_x, 64.0);
        assert_eq!(right_x, 664.0);
        assert_eq!(left_x + half_width, right_x);
    }

    #[test]
    fn test_normalize_url() {
        assert_eq!(normalize_url("google.com"), "https://google.com");
        assert_eq!(normalize_url("https://github.com"), "https://github.com");
        assert_eq!(normalize_url("http://localhost:3000"), "http://localhost:3000");
    }

    #[test]
    fn test_split_view_request_serde() {
        let json = r#"{
            "tab_id": "test-split-1",
            "left_url": "https://github.com",
            "right_url": "https://atlassian.com",
            "bounds": {
                "x": 64.0,
                "y": 108.0,
                "width": 1200.0,
                "height": 800.0
            }
        }"#;

        let req: SplitViewRequest = serde_json::from_str(json).expect("Failed to deserialize SplitViewRequest");
        assert_eq!(req.tab_id.as_deref(), Some("test-split-1"));
        assert_eq!(req.left_url, "https://github.com");
        assert_eq!(req.right_url, "https://atlassian.com");
        assert_eq!(req.bounds.width, 1200.0);
    }
}
