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
                // Hide other tab overlays
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        child.hide();
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

    pub fn attach_split_views(app: &AppHandle, tab_id: &str, bounds: SplitBounds) -> Result<(), String> {
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
                // Hide other tab overlays
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        child.hide();
                    }
                }

                let new_children: Vec<gtk::Widget> = vbox.children()
                    .into_iter()
                    .filter(|c| c != &overlay)
                    .collect();

                for child in &new_children {
                    vbox.remove(child);
                }

                let split_box = gtk::Box::new(gtk::Orientation::Horizontal, 0);
                split_box.set_widget_name(&tab_id);
                split_box.set_homogeneous(true);
                for child in &new_children {
                    split_box.pack_start(child, true, true, 0);
                }

                split_box.set_margin_start(bounds.x as i32);
                split_box.set_margin_top(bounds.y as i32);
                split_box.set_halign(gtk::Align::Fill);
                split_box.set_valign(gtk::Align::Fill);
                split_box.set_hexpand(true);
                split_box.set_vexpand(true);

                overlay.add_overlay(&split_box);
                for child in &new_children {
                    child.show_all();
                    child.show();
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
                    for child in overlay.children() {
                        if main_child.as_ref() != Some(&child) {
                            child.set_margin_start(bounds.x as i32);
                            child.set_margin_top(bounds.y as i32);
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

pub fn spawn_single_view(app: &AppHandle, req: SingleViewRequest) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "single_view".to_string());

    if let Some(view) = app.get_webview(&tab_id) {
        let _ = view.set_position(LogicalPosition::new(req.bounds.x, req.bounds.y));
        let _ = view.set_size(LogicalSize::new(req.bounds.width, req.bounds.height));
        #[cfg(target_os = "linux")]
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    gtk_overlay::hide_all_tab_views(app)?;

    let url: url::Url = req.url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let app_title = app.clone();
    let builder = WebviewBuilder::new(&tab_id, WebviewUrl::External(url))
        .on_document_title_changed(move |_webview, title| {
            use tauri::Emitter;
            let _ = app_title.emit("webview-title-changed", title);
        });

    window.add_child(
        builder,
        LogicalPosition::new(req.bounds.x, req.bounds.y),
        LogicalSize::new(req.bounds.width, req.bounds.height),
    ).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        gtk_overlay::attach_single_view(app, &tab_id, req.bounds)?;
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
    }

    Ok(())
}

pub fn spawn_split_views(app: &AppHandle, req: SplitViewRequest) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;
    let tab_id = req.tab_id.unwrap_or_else(|| "split_view".to_string());
    let left_label = format!("{}_left", tab_id);
    let right_label = format!("{}_right", tab_id);

    if app.get_webview(&left_label).is_some() && app.get_webview(&right_label).is_some() {
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

    #[cfg(target_os = "linux")]
    gtk_overlay::hide_all_tab_views(app)?;

    let half_width = req.bounds.width / 2.0;
    let height = req.bounds.height;
    let top_y = req.bounds.y;
    let left_x = req.bounds.x;
    let right_x = req.bounds.x + half_width;

    let left_url: url::Url = req.left_url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let right_url: url::Url = req.right_url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let app_left = app.clone();
    let left_builder = WebviewBuilder::new(&left_label, WebviewUrl::External(left_url))
        .on_document_title_changed(move |_webview, title| {
            use tauri::Emitter;
            let _ = app_left.emit("webview-split-left-title-changed", title);
        });

    let app_right = app.clone();
    let right_builder = WebviewBuilder::new(&right_label, WebviewUrl::External(right_url))
        .on_document_title_changed(move |_webview, title| {
            use tauri::Emitter;
            let _ = app_right.emit("webview-split-right-title-changed", title);
        });

    window.add_child(
        left_builder,
        LogicalPosition::new(left_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    window.add_child(
        right_builder,
        LogicalPosition::new(right_x, top_y),
        LogicalSize::new(half_width, height),
    ).map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    {
        gtk_overlay::attach_split_views(app, &tab_id, req.bounds)?;
        gtk_overlay::activate_tab_view(app, &tab_id, req.bounds)?;
    }

    Ok(())
}

pub fn update_split_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
    let half_width = bounds.width / 2.0;
    let height = bounds.height;
    let top_y = bounds.y;
    let left_x = bounds.x;
    let right_x = bounds.x + half_width;

    if let Some(view) = app.get_webview("single_view") {
        let _ = view.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = view.set_size(LogicalSize::new(bounds.width, bounds.height));
    }
    if let Some(left) = app.get_webview("split_left") {
        let _ = left.set_position(LogicalPosition::new(left_x, top_y));
        let _ = left.set_size(LogicalSize::new(half_width, height));
    }
    if let Some(right) = app.get_webview("split_right") {
        let _ = right.set_position(LogicalPosition::new(right_x, top_y));
        let _ = right.set_size(LogicalSize::new(half_width, height));
    }

    #[cfg(target_os = "linux")]
    let _ = gtk_overlay::update_overlay_bounds(app, bounds);

    Ok(())
}

pub fn navigate_split_view(app: &AppHandle, pane: &str, target_url: &str) -> Result<(), String> {
    let label = match pane {
        "single" => "single_view",
        "left" => "split_left",
        "right" => "split_right",
        other => other,
    };

    if let Some(view) = app.get_webview(label) {
        let parsed: url::Url = target_url.parse().map_err(|e: url::ParseError| e.to_string())?;
        view.navigate(parsed).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Webview '{}' not active", label))
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

    if let Some(view) = app.get_webview("single_view") {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview("split_left") {
        let _ = view.close();
    }
    if let Some(view) = app.get_webview("split_right") {
        let _ = view.close();
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
