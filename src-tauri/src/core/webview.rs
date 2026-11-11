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

    pub fn attach_single_view(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
        ensure_overlay(app)?;
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                let overlay = vbox.children()
                    .into_iter()
                    .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
                    .ok_or("Overlay not found in vbox")?;

                let main_child = overlay.child();
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        overlay.remove(&child);
                    }
                }

                let other_children: Vec<gtk::Widget> = vbox.children()
                    .into_iter()
                    .filter(|c| c != &overlay)
                    .collect();

                for child in other_children {
                    vbox.remove(&child);
                    child.set_margin_start(bounds.x as i32);
                    child.set_margin_top(bounds.y as i32);
                    child.set_halign(gtk::Align::Fill);
                    child.set_valign(gtk::Align::Fill);
                    child.set_hexpand(true);
                    child.set_vexpand(true);
                    overlay.add_overlay(&child);
                    child.show_all();
                }
                overlay.show_all();
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
    }

    pub fn attach_split_views(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
        ensure_overlay(app)?;
        let (tx, rx) = std::sync::mpsc::channel();
        let app_handle = app.clone();
        app.run_on_main_thread(move || {
            let res = (|| -> Result<(), String> {
                let window = app_handle.get_window("main").ok_or("Main window not found")?;
                let vbox = window.default_vbox().map_err(|e| e.to_string())?;
                let overlay = vbox.children()
                    .into_iter()
                    .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
                    .ok_or("Overlay not found in vbox")?;

                let main_child = overlay.child();
                for child in overlay.children() {
                    if main_child.as_ref() != Some(&child) {
                        overlay.remove(&child);
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
                split_box.set_homogeneous(true);
                for child in new_children {
                    split_box.pack_start(&child, true, true, 0);
                }

                split_box.set_margin_start(bounds.x as i32);
                split_box.set_margin_top(bounds.y as i32);
                split_box.set_halign(gtk::Align::Fill);
                split_box.set_valign(gtk::Align::Fill);
                split_box.set_hexpand(true);
                split_box.set_vexpand(true);

                overlay.add_overlay(&split_box);
                split_box.show_all();
                overlay.show_all();
                Ok(())
            })();
            let _ = tx.send(res);
        }).map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())?
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
    pub left_url: String,
    pub right_url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleViewRequest {
    pub url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub fn spawn_single_view(app: &AppHandle, req: SingleViewRequest) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;

    if let Some(view) = app.get_webview("single_view") {
        if app.get_webview("split_left").is_none() && app.get_webview("split_right").is_none() {
            let parsed: url::Url = req.url.parse().map_err(|e: url::ParseError| e.to_string())?;
            view.navigate(parsed).map_err(|e| e.to_string())?;
            let _ = view.set_position(LogicalPosition::new(req.bounds.x, req.bounds.y));
            let _ = view.set_size(LogicalSize::new(req.bounds.width, req.bounds.height));
            #[cfg(target_os = "linux")]
            let _ = gtk_overlay::update_overlay_bounds(app, req.bounds);
            return Ok(());
        }
    }

    close_split_views(app)?;

    let url: url::Url = req.url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let app_title = app.clone();
    let builder = WebviewBuilder::new("single_view", WebviewUrl::External(url))
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
    gtk_overlay::attach_single_view(app, req.bounds)?;

    Ok(())
}

pub fn spawn_split_views(app: &AppHandle, req: SplitViewRequest) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window not found")?;

    close_split_views(app)?;

    let half_width = req.bounds.width / 2.0;
    let height = req.bounds.height;
    let top_y = req.bounds.y;
    let left_x = req.bounds.x;
    let right_x = req.bounds.x + half_width;

    let left_url: url::Url = req.left_url.parse().map_err(|e: url::ParseError| e.to_string())?;
    let right_url: url::Url = req.right_url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let app_left = app.clone();
    let left_builder = WebviewBuilder::new("split_left", WebviewUrl::External(left_url))
        .on_document_title_changed(move |_webview, title| {
            use tauri::Emitter;
            let _ = app_left.emit("webview-split-left-title-changed", title);
        });

    let app_right = app.clone();
    let right_builder = WebviewBuilder::new("split_right", WebviewUrl::External(right_url))
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
    gtk_overlay::attach_split_views(app, req.bounds)?;

    Ok(())
}

pub fn update_split_bounds(app: &AppHandle, bounds: SplitBounds) -> Result<(), String> {
    if let Some(view) = app.get_webview("single_view") {
        let _ = view.set_position(LogicalPosition::new(bounds.x, bounds.y));
        let _ = view.set_size(LogicalSize::new(bounds.width, bounds.height));
    }

    let half_width = bounds.width / 2.0;
    let height = bounds.height;
    let top_y = bounds.y;
    let left_x = bounds.x;
    let right_x = bounds.x + half_width;

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
    app.get_webview("single_view").is_some() ||
    app.get_webview("split_left").is_some() ||
    app.get_webview("split_right").is_some()
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
