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

                let paned = gtk::Paned::new(gtk::Orientation::Horizontal);
                paned.set_widget_name(&tab_id);
                paned.set_wide_handle(true);
                paned.style_context().add_class("split-paned");

                let ratio = bounds.split_ratio();
                crate::core::webview::set_tab_split_ratio(&tab_id, ratio);
                let total_w = bounds.width;
                let min_pos = ((total_w as f64) * crate::core::webview::MIN_SPLIT_RATIO) as i32;
                let max_pos = ((total_w as f64) * crate::core::webview::MAX_SPLIT_RATIO) as i32;
                let initial_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
                paned.set_position(initial_pos);

                if let Some(left) = &left_widget {
                    left.set_widget_name(&left_label);
                    left.set_halign(gtk::Align::Fill);
                    left.set_valign(gtk::Align::Fill);
                    left.set_hexpand(true);
                    left.set_vexpand(true);
                    paned.pack1(left, true, true);
                }
                if let Some(right) = &right_widget {
                    right.set_widget_name(&right_label);
                    right.set_halign(gtk::Align::Fill);
                    right.set_valign(gtk::Align::Fill);
                    right.set_hexpand(true);
                    right.set_vexpand(true);
                    paned.pack2(right, true, true);
                }

                let app_paned = app_handle.clone();
                let tab_id_paned = tab_id.clone();
                let last_ratio = std::sync::Arc::new(std::sync::Mutex::new(ratio));
                paned.connect_notify(Some("position"), move |p, _| {
                    let pos = p.position();
                    let total_width = p.allocated_width();
                    if total_width > 50 && pos > 0 {
                        let ratio = ((pos as f64) / (total_width as f64))
                            .clamp(crate::core::webview::MIN_SPLIT_RATIO, crate::core::webview::MAX_SPLIT_RATIO);
                        let mut last = last_ratio.lock().unwrap();
                        if (ratio - *last).abs() >= 0.005 {
                            *last = ratio;
                            crate::core::webview::set_tab_split_ratio(&tab_id_paned, ratio);
                            use tauri::Emitter;
                            #[derive(serde::Serialize, Clone)]
                            struct SplitRatioPayload {
                                tab_id: String,
                                ratio: f64,
                                left_width: f64,
                                right_width: f64,
                            }
                            let left_w = (total_width as f64) * ratio;
                            let right_w = (total_width as f64) - left_w;
                            let _ = app_paned.emit("split-ratio-changed", SplitRatioPayload {
                                tab_id: tab_id_paned.clone(),
                                ratio,
                                left_width: left_w,
                                right_width: right_w,
                            });
                        }
                    }
                });

                paned.set_margin_start(bounds.x as i32);
                paned.set_margin_top(bounds.y as i32);
                let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                paned.set_margin_end(margin_end);
                paned.set_halign(gtk::Align::Fill);
                paned.set_valign(gtk::Align::Fill);
                paned.set_hexpand(true);
                paned.set_vexpand(true);

                overlay.add_overlay(&paned);

                if let Some(left) = &left_widget {
                    left.show_all();
                    left.show();
                }
                if let Some(right) = &right_widget {
                    right.show_all();
                    right.show();
                }
                paned.show_all();
                paned.show();
                paned.queue_resize();
                paned.queue_draw();
                paned.set_no_show_all(true);

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
                                if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                                    let min_pos = ((bounds.width as f64) * crate::core::webview::MIN_SPLIT_RATIO) as i32;
                                    let max_pos = ((bounds.width as f64) * crate::core::webview::MAX_SPLIT_RATIO) as i32;
                                    let ratio = bounds.split_ratio.unwrap_or_else(|| crate::core::webview::get_tab_split_ratio(&tab_id))
                                        .clamp(crate::core::webview::MIN_SPLIT_RATIO, crate::core::webview::MAX_SPLIT_RATIO);
                                    let target_pos = (((bounds.width as f64) * ratio) as i32).clamp(min_pos, max_pos);
                                    paned.set_position(target_pos);
                                }
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
                            if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                                let min_pos = ((bounds.width as f64) * crate::core::webview::MIN_SPLIT_RATIO) as i32;
                                let max_pos = ((bounds.width as f64) * crate::core::webview::MAX_SPLIT_RATIO) as i32;
                                let ratio = bounds.split_ratio.unwrap_or_else(|| {
                                    let tab_name = child.widget_name().to_string();
                                    crate::core::webview::get_tab_split_ratio(&tab_name)
                                }).clamp(crate::core::webview::MIN_SPLIT_RATIO, crate::core::webview::MAX_SPLIT_RATIO);
                                let target_pos = (((bounds.width as f64) * ratio) as i32).clamp(min_pos, max_pos);
                                paned.set_position(target_pos);
                            }
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

pub fn init_gtk_overlay(app: &AppHandle) -> Result<(), String> {
    gtk::glib::log_set_default_handler(|log_domain, log_level, message| {
        if message.contains("WEBKIT_HARDWARE_ACCELERATION_POLICY_ON_DEMAND") {
            return;
        }
        gtk::glib::log_default_handler(log_domain, log_level, Some(message));
    });

    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        use gtk::prelude::*;
        let provider = gtk::CssProvider::new();
        let css = "
            paned.split-paned > separator {
                background-color: #242426;
                border-left: 1px solid #353535;
                border-right: 1px solid #353535;
                min-width: 6px;
                margin: 0;
                transition: background-color 0.15s ease-in-out;
            }
            paned.split-paned > separator:hover,
            paned.split-paned > separator:active {
                background-color: #f85e2a;
                border-color: #f85e2a;
            }
        ";
        if provider.load_from_data(css.as_bytes()).is_ok() {
            if let Some(screen) = gtk::gdk::Screen::default() {
                gtk::StyleContext::add_provider_for_screen(
                    &screen,
                    &provider,
                    gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
                );
            }
        }
        let _ = tx.send(());
    }).map_err(|e| e.to_string())?;
    let _ = rx.recv();

    gtk_overlay::ensure_overlay(app)
}

pub const MIN_SPLIT_RATIO: f64 = 0.20;
pub const MAX_SPLIT_RATIO: f64 = 0.80;

static SPLIT_RATIOS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, f64>>> = std::sync::OnceLock::new();

fn get_split_ratios_map() -> &'static std::sync::Mutex<std::collections::HashMap<String, f64>> {
    SPLIT_RATIOS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

pub fn get_tab_split_ratio(tab_id: &str) -> f64 {
    let map = get_split_ratios_map().lock().unwrap();
    map.get(tab_id).copied().unwrap_or(0.5)
}

pub fn set_tab_split_ratio(tab_id: &str, ratio: f64) {
    let mut map = get_split_ratios_map().lock().unwrap();
    map.insert(tab_id.to_string(), ratio.clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO));
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
    #[serde(default)]
    pub split_ratio: Option<f64>,
}

impl SplitBounds {
    pub fn split_ratio(&self) -> f64 {
        self.split_ratio.unwrap_or(0.5).clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO)
    }

    pub fn left_width(&self) -> f64 {
        self.width * self.split_ratio()
    }

    pub fn right_width(&self) -> f64 {
        self.width - self.left_width()
    }

    pub fn left_x(&self) -> f64 {
        self.x
    }

    pub fn right_x(&self) -> f64 {
        self.x + self.left_width()
    }
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

fn configure_native_webview(app: &AppHandle, webview: &tauri::Webview, tab_id: &str) {
    use webkit2gtk::{PolicyDecisionExt, SettingsExt, WebViewExt, URIRequestExt, WebResourceExt, UserContentManagerExt, CookieManagerExt, WebsiteDataManagerExt};
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
        }

        // 1b. Set cookie policy based on shield tracker blocking
        if let Some(data_manager) = inner_wv.website_data_manager() {
            if let Some(cookie_mgr) = data_manager.cookie_manager() {
                let manager = crate::core::shield::get_shield_manager();
                if manager.is_enabled() && manager.is_block_trackers() {
                    cookie_mgr.set_accept_policy(webkit2gtk::CookieAcceptPolicy::NoThirdParty);
                } else {
                    cookie_mgr.set_accept_policy(webkit2gtk::CookieAcceptPolicy::Always);
                }
            }
        }

        // 2. Unblock autoplay policy & filter popup ad windows via Brave adblock-rust
        let app_popup = app_handle.clone();
        let tab_id_popup = tab_id_str.clone();
        inner_wv.connect_decide_policy(move |wv, decision, decision_type| {
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
                                if should_block || manager.is_aggressive_sandbox() {
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

            if decision_type == webkit2gtk::PolicyDecisionType::NavigationAction {
                use gtk::prelude::Cast;
                use webkit2gtk::{NavigationPolicyDecisionExt, URIRequestExt, WebViewExt};
                if let Some(nav_action) = decision.dynamic_cast_ref::<webkit2gtk::NavigationPolicyDecision>() {
                    #[allow(deprecated)]
                    let req_opt = nav_action.navigation_action().and_then(|na| na.request()).or_else(|| nav_action.request());
                    if let Some(req) = req_opt {
                        if let Some(uri) = req.uri() {
                            let uri_str = uri.as_str();
                            let manager = crate::core::shield::get_shield_manager();
                            if manager.is_enabled() && manager.is_upgrade_https()
                                && uri_str.starts_with("http://")
                                && !uri_str.starts_with("http://localhost")
                                && !uri_str.starts_with("http://127.0.0.1")
                            {
                                let upgraded = format!("https://{}", &uri_str[7..]);
                                decision.ignore();
                                wv.load_uri(&upgraded);
                                return true;
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
                        let app_res = app_resource.clone();
                        let tab_res = tab_id_resource.clone();
                        let uri_owned = uri_str.to_string();
                        tauri::async_runtime::spawn(async move {
                            crate::commands::shield::record_and_emit_block(
                                &app_res,
                                &tab_res,
                                &uri_owned,
                                Some(category),
                                1,
                            );
                        });
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

static SPAWN_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

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
                let (root_tab, combined_breakdown) = crate::core::shield::get_shield_manager().reset_tab(&tab_id_load);
                let _ = app_load.emit("shield-blocked-event", crate::commands::shield::ShieldBlockEvent {
                    tab_id: root_tab,
                    url: "reset".to_string(),
                    category: "reset".to_string(),
                    tab_count: combined_breakdown.total,
                    total_count: crate::core::shield::get_shield_manager().get_stats().total_blocked,
                    tab_breakdown: combined_breakdown,
                });
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

    let ratio = req.bounds.split_ratio.unwrap_or_else(|| get_tab_split_ratio(&tab_id))
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

    gtk_overlay::hide_all_tab_views(app)?;

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
                let (root_tab, combined_breakdown) = crate::core::shield::get_shield_manager().reset_tab(&tab_id_left);
                let _ = app_left_load.emit("shield-blocked-event", crate::commands::shield::ShieldBlockEvent {
                    tab_id: root_tab,
                    url: "reset".to_string(),
                    category: "reset".to_string(),
                    tab_count: combined_breakdown.total,
                    total_count: crate::core::shield::get_shield_manager().get_stats().total_blocked,
                    tab_breakdown: combined_breakdown,
                });
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
                let (root_tab, combined_breakdown) = crate::core::shield::get_shield_manager().reset_tab(&tab_id_right);
                let _ = app_right_load.emit("shield-blocked-event", crate::commands::shield::ShieldBlockEvent {
                    tab_id: root_tab,
                    url: "reset".to_string(),
                    category: "reset".to_string(),
                    tab_count: combined_breakdown.total,
                    total_count: crate::core::shield::get_shield_manager().get_stats().total_blocked,
                    tab_breakdown: combined_breakdown,
                });
            }

            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                crate::core::shield::inject_page_cosmetics(&webview, &tab_id_right, payload.url().as_str());
            }
        });

    let left_webview = window.add_child(
        left_builder,
        LogicalPosition::new(left_x, top_y),
        LogicalSize::new(left_width, height),
    ).map_err(|e| e.to_string())?;

    let right_webview = window.add_child(
        right_builder,
        LogicalPosition::new(right_x, top_y),
        LogicalSize::new(right_width, height),
    ).map_err(|e| e.to_string())?;

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

pub fn update_split_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
    for (label, view) in app.webviews() {
        if label == "main" || label.ends_with("_left") || label.ends_with("_right") {
            continue;
        }
        let _ = view.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = view.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    let _ = gtk_overlay::update_overlay_bounds(app, bounds);

    Ok(())
}

pub fn set_split_ratio(app: &AppHandle, tab_id: Option<&str>, ratio: f64) -> Result<(), String> {
    let ratio = ratio.clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
    let target_tab = tab_id.unwrap_or("split_view");
    set_tab_split_ratio(target_tab, ratio);

    let (tx, rx) = std::sync::mpsc::channel();
    let app_handle = app.clone();
    let tab_id_str = target_tab.to_string();
    app.run_on_main_thread(move || {
        use gtk::prelude::*;
        let res = (|| -> Result<(), String> {
            let window = app_handle.get_window("main").ok_or("Main window not found")?;
            let vbox = window.default_vbox().map_err(|e| e.to_string())?;
            if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
                let main_child = overlay.child();
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) && child.widget_name().as_str() == tab_id_str.as_str() {
                        if let Ok(paned) = child.dynamic_cast::<gtk::Paned>() {
                            let total_w = if paned.allocated_width() > 0 {
                                paned.allocated_width()
                            } else {
                                window.inner_size().map(|s| s.width as i32).unwrap_or(800)
                            };
                            let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
                            let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
                            let pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
                            paned.set_position(pos);
                            paned.queue_resize();
                        }
                    }
                }
            }
            Ok(())
        })();
        let _ = tx.send(res);
    }).map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())??;

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
        let _ = view.with_webview(|platform_webview| {
            use webkit2gtk::WebViewExt;
            platform_webview.inner().reload();
        });
        let _ = view.eval("window.location.reload()");
        return Ok(());
    }
    let left_label = format!("{}_left", target);
    let right_label = format!("{}_right", target);
    let mut found = false;
    if let Some(view) = app.get_webview(&left_label) {
        let _ = view.with_webview(|platform_webview| {
            use webkit2gtk::WebViewExt;
            platform_webview.inner().reload();
        });
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if let Some(view) = app.get_webview(&right_label) {
        let _ = view.with_webview(|platform_webview| {
            use webkit2gtk::WebViewExt;
            platform_webview.inner().reload();
        });
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if found {
        return Ok(());
    }
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.with_webview(|platform_webview| {
            use webkit2gtk::WebViewExt;
            platform_webview.inner().reload();
        });
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if let Some(view) = app.get_webview("split_right") {
        let _ = view.with_webview(|platform_webview| {
            use webkit2gtk::WebViewExt;
            platform_webview.inner().reload();
        });
        let _ = view.eval("window.location.reload()");
        found = true;
    }
    if found {
        Ok(())
    } else {
        Err(format!("Webview '{}' not found", target))
    }
}

unsafe extern "C" {
    fn malloc_trim(pad: usize) -> i32;
}

pub fn is_split_active(app: &AppHandle) -> bool {
    gtk_overlay::has_any_overlay(app)
}

pub fn hide_all_webviews(app: &AppHandle) -> Result<(), String> {
    gtk_overlay::hide_all_tab_views(app)?;
    Ok(())
}

pub fn close_tab_view(app: &AppHandle, tab_id: &str) -> Result<(), String> {
    crate::core::shield::get_shield_manager().reset_tab(tab_id);
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
    let _ = gtk_overlay::cleanup_overlay(app);

    for (label, webview) in app.webviews() {
        if label != "main" {
            let _ = webview.close();
        }
    }

    use webkit2gtk::WebContextExt;
    if let Some(context) = webkit2gtk::WebContext::default() {
        context.clear_cache();
    }
    unsafe {
        malloc_trim(0);
    }

    Ok(())
}
