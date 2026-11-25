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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use gtk::prelude::*;
use tauri::{AppHandle, Manager};
use crate::core::webview::split::{SplitBounds, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO};
use crate::core::overlay::{is_overlay_layer, ensure_overlay_layer_on_top};

static IS_FULLSCREEN: AtomicBool = AtomicBool::new(false);
static LAST_BOUNDS: OnceLock<Mutex<Option<SplitBounds>>> = OnceLock::new();

fn last_bounds_lock() -> &'static Mutex<Option<SplitBounds>> {
    LAST_BOUNDS.get_or_init(|| Mutex::new(None))
}

fn save_last_bounds(bounds: SplitBounds) {
    if let Ok(mut guard) = last_bounds_lock().lock() {
        *guard = Some(bounds);
    }
}

pub fn is_fullscreen() -> bool {
    IS_FULLSCREEN.load(Ordering::SeqCst)
}

fn run_on_gtk_thread<T: Send + 'static, F: FnOnce() -> Result<T, String> + Send + 'static>(
    app: &AppHandle,
    f: F,
) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let res = f();
        let _ = tx.send(res);
    }).map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

pub fn ensure_overlay(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    run_on_gtk_thread(app, move || {
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

        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            crate::core::overlay::ensure_overlay_layer(&overlay);
        }

        Ok(())
    })
}

pub fn attach_single_view(app: &AppHandle, tab_id: &str, bounds: SplitBounds) -> Result<(), String> {
    save_last_bounds(bounds);
    ensure_overlay(app)?;
    let app_handle = app.clone();
    let tab_id = tab_id.to_string();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let overlay = vbox.children()
            .into_iter()
            .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
            .ok_or("Overlay not found in vbox")?;

        let main_child = overlay.child();
        for child in overlay.children() {
            if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
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

        ensure_overlay_layer_on_top(&overlay);

        Ok(())
    })
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
                    if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) && child.widget_name().as_str() == tab_id.as_str() {
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
    save_last_bounds(bounds);
    let app_handle = app.clone();
    let tab_id = tab_id.to_string();
    let left_label = left_label.to_string();
    let right_label = right_label.to_string();
    run_on_gtk_thread(app, move || {
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

        let overlay = vbox.children()
            .into_iter()
            .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
            .ok_or("Overlay not found in vbox")?;

        let main_child = overlay.child();

        for child in overlay.children() {
            if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                if child.widget_name().as_str() == tab_id.as_str() {
                    overlay.remove(&child);
                } else {
                    child.hide();
                }
            }
        }

        let new_children: Vec<gtk::Widget> = vbox.children()
            .into_iter()
            .filter(|c| c != &overlay)
            .collect();

        for child in &new_children {
            vbox.remove(child);
        }

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
        crate::core::webview::split::set_tab_split_ratio(&tab_id, ratio);
        let total_w = bounds.width;
        let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
        let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
        let initial_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
        paned.set_position(initial_pos);

        if let Some(left) = &left_widget {
            left.set_widget_name(&left_label);
            left.set_halign(gtk::Align::Fill);
            left.set_valign(gtk::Align::Fill);
            left.set_hexpand(true);
            left.set_vexpand(true);
            left.set_size_request(min_pos, -1);
            paned.pack1(left, true, false);
        }
        if let Some(right) = &right_widget {
            right.set_widget_name(&right_label);
            right.set_halign(gtk::Align::Fill);
            right.set_valign(gtk::Align::Fill);
            right.set_hexpand(true);
            right.set_vexpand(true);
            right.set_size_request(min_pos, -1);
            paned.pack2(right, true, false);
        }

        let app_paned = app_handle.clone();
        let tab_id_paned = tab_id.clone();
        let last_ratio = std::sync::Arc::new(std::sync::Mutex::new(ratio));
        let is_clamping = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let is_clamping_clone = is_clamping.clone();
        paned.connect_notify(Some("position"), move |p, _| {
            if is_fullscreen() || is_clamping_clone.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            let pos = p.position();
            let total_width = p.allocated_width();
            if total_width > 50 && pos > 0 {
                let min_pos = ((total_width as f64) * MIN_SPLIT_RATIO).round() as i32;
                let max_pos = ((total_width as f64) * MAX_SPLIT_RATIO).round() as i32;
                let clamped_pos = pos.clamp(min_pos, max_pos);
                if pos != clamped_pos {
                    is_clamping_clone.store(true, std::sync::atomic::Ordering::Relaxed);
                    p.set_position(clamped_pos);
                    is_clamping_clone.store(false, std::sync::atomic::Ordering::Relaxed);
                }
                let ratio = ((clamped_pos as f64) / (total_width as f64))
                    .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
                let mut last = last_ratio.lock().unwrap();
                if (ratio - *last).abs() >= 0.005 {
                    *last = ratio;
                    crate::core::webview::split::set_tab_split_ratio(&tab_id_paned, ratio);
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

        paned.connect_size_allocate(|p, alloc| {
            if is_fullscreen() {
                return;
            }
            let total_width = alloc.width();
            if total_width > 50 {
                let min_pos = ((total_width as f64) * MIN_SPLIT_RATIO).round() as i32;
                if let Some(c1) = p.child1() {
                    c1.set_size_request(min_pos, -1);
                }
                if let Some(c2) = p.child2() {
                    c2.set_size_request(min_pos, -1);
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

        ensure_overlay_layer_on_top(&overlay);

        Ok(())
    })
}

pub fn activate_tab_view(app: &AppHandle, tab_id: &str, bounds: SplitBounds) -> Result<bool, String> {
    save_last_bounds(bounds);
    let app_handle = app.clone();
    let tab_id = tab_id.to_string();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        if IS_FULLSCREEN.swap(false, Ordering::SeqCst) {
            let _ = window.set_fullscreen(false);
        }
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let mut found = false;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                    if child.widget_name().as_str() == tab_id.as_str() {
                        found = true;
                        overlay.set_overlay_pass_through(&child, false);
                        child.set_opacity(1.0);
                        child.set_margin_start(bounds.x as i32);
                        child.set_margin_top(bounds.y as i32);
                        let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                        let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
                        let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                        child.set_margin_end(margin_end);
                        if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                            let total_w = if paned.allocated_width() > 0 { paned.allocated_width() } else { bounds.width as i32 };
                            let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
                            let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
                            let ratio = bounds.split_ratio.unwrap_or_else(|| crate::core::webview::split::get_tab_split_ratio(&tab_id))
                                .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
                            let target_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
                            paned.set_position(target_pos);
                            if let Some(c1) = paned.child1() {
                                c1.set_size_request(min_pos, -1);
                                c1.show_all();
                                c1.show();
                            }
                            if let Some(c2) = paned.child2() {
                                c2.set_size_request(min_pos, -1);
                                c2.show_all();
                                c2.show();
                            }
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
                        overlay.set_overlay_pass_through(&child, true);
                        child.hide();
                    }
                }
            }
            ensure_overlay_layer_on_top(&overlay);
        }
        Ok(found)
    })
}

pub fn hide_all_tab_views(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        if IS_FULLSCREEN.swap(false, Ordering::SeqCst) {
            let _ = window.set_fullscreen(false);
        }
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                    overlay.set_overlay_pass_through(&child, true);
                    child.hide();
                }
            }
        }
        Ok(())
    })
}

pub fn set_drag_mode(app: &AppHandle, active: bool) -> Result<(), String> {
    let app_handle = app.clone();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                    if active {
                        if child.is_visible() {
                            overlay.set_overlay_pass_through(&child, true);
                            child.set_opacity(0.25);
                        }
                    } else {
                        overlay.set_overlay_pass_through(&child, false);
                        child.set_opacity(1.0);
                    }
                }
            }
        }
        Ok(())
    })
}

pub fn minimize_split_pane(
    app: &AppHandle,
    tab_id: &str,
    pane_to_minimize: &str,
    minimized_tab_id: &str,
    bounds: SplitBounds,
) -> Result<bool, String> {
    let app_handle = app.clone();
    let tab_id = tab_id.to_string();
    let pane = pane_to_minimize.to_string();
    let min_id = minimized_tab_id.to_string();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let overlay = vbox.children()
            .into_iter()
            .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
            .ok_or("Overlay not found in vbox")?;

        let main_child = overlay.child();
        let paned_opt = overlay.children()
            .into_iter()
            .find(|c| main_child.as_ref() != Some(c) && !is_overlay_layer(c) && c.widget_name().as_str() == tab_id.as_str());

        let paned = match paned_opt.and_then(|w| w.dynamic_cast::<gtk::Paned>().ok()) {
            Some(p) => p,
            None => return Ok(false),
        };

        let c1 = paned.child1();
        let c2 = paned.child2();

        let (minimized_widget, remaining_widget) = if pane == "left" {
            (c1, c2)
        } else {
            (c2, c1)
        };

        if let Some(w) = &minimized_widget {
            paned.remove(w);
        }
        if let Some(w) = &remaining_widget {
            paned.remove(w);
        }
        overlay.remove(&paned);

        let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
        let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
        let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);

        if let Some(rem) = remaining_widget {
            rem.set_size_request(-1, -1);
            rem.set_widget_name(&tab_id);
            rem.set_margin_start(bounds.x as i32);
            rem.set_margin_top(bounds.y as i32);
            rem.set_margin_end(margin_end);
            rem.set_halign(gtk::Align::Fill);
            rem.set_valign(gtk::Align::Fill);
            rem.set_hexpand(true);
            rem.set_vexpand(true);
            overlay.add_overlay(&rem);
            overlay.set_overlay_pass_through(&rem, false);
            rem.set_opacity(1.0);
            rem.show_all();
            rem.show();
            rem.queue_resize();
            rem.queue_draw();
        }

        if let Some(min) = minimized_widget {
            min.set_size_request(-1, -1);
            min.set_widget_name(&min_id);
            min.set_margin_start(0);
            min.set_margin_top(0);
            min.set_margin_end(0);
            min.set_margin_bottom(0);
            overlay.add_overlay(&min);
            overlay.set_overlay_pass_through(&min, true);
            min.hide();
        }

        Ok(true)
    })
}

pub fn merge_tabs_to_split(
    app: &AppHandle,
    active_tab_id: &str,
    other_tab_id: &str,
    other_pane: &str,
    bounds: SplitBounds,
) -> Result<bool, String> {
    let app_handle = app.clone();
    let active_tab_id = active_tab_id.to_string();
    let other_tab_id = other_tab_id.to_string();
    let other_pane = other_pane.to_string();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let overlay = vbox.children()
            .into_iter()
            .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
            .ok_or("Overlay not found in vbox")?;

        let main_child = overlay.child();
        let active_widget = overlay.children()
            .into_iter()
            .find(|c| main_child.as_ref() != Some(c) && !is_overlay_layer(c) && c.widget_name().as_str() == active_tab_id.as_str());

        let other_widget = overlay.children()
            .into_iter()
            .find(|c| main_child.as_ref() != Some(c) && !is_overlay_layer(c) && c.widget_name().as_str() == other_tab_id.as_str());

        let (act, oth) = match (active_widget, other_widget) {
            (Some(a), Some(o)) => (a, o),
            _ => return Ok(false),
        };

        let act_resolved = if let Ok(act_paned) = act.clone().dynamic_cast::<gtk::Paned>() {
            let c1 = act_paned.child1();
            let c2 = act_paned.child2();
            let (replaced_child, kept_child) = if other_pane == "left" {
                (c1, c2)
            } else {
                (c2, c1)
            };
            if let Some(w) = &replaced_child {
                act_paned.remove(w);
                let parked_id = format!("{}_parked", active_tab_id);
                w.set_widget_name(&parked_id);
                w.set_margin_start(0);
                w.set_margin_top(0);
                w.set_margin_end(0);
                w.set_margin_bottom(0);
                overlay.add_overlay(w);
                overlay.set_overlay_pass_through(w, true);
                w.hide();
            }
            if let Some(w) = &kept_child {
                act_paned.remove(w);
            }
            overlay.remove(&act_paned);
            match kept_child {
                Some(w) => w,
                None => return Ok(false),
            }
        } else {
            overlay.remove(&act);
            act
        };

        overlay.remove(&oth);

        let paned = gtk::Paned::new(gtk::Orientation::Horizontal);
        paned.set_widget_name(&active_tab_id);
        paned.set_wide_handle(true);
        paned.style_context().add_class("split-paned");

        let ratio = bounds.split_ratio();
        crate::core::webview::split::set_tab_split_ratio(&active_tab_id, ratio);
        let total_w = bounds.width;
        let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
        let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
        let initial_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
        paned.set_position(initial_pos);

        let (left_w, right_w) = if other_pane == "left" {
            (oth, act_resolved)
        } else {
            (act_resolved, oth)
        };

        left_w.set_margin_start(0);
        left_w.set_margin_top(0);
        left_w.set_margin_end(0);
        left_w.set_margin_bottom(0);
        left_w.set_halign(gtk::Align::Fill);
        left_w.set_valign(gtk::Align::Fill);
        left_w.set_hexpand(true);
        left_w.set_vexpand(true);
        left_w.set_opacity(1.0);
        left_w.set_size_request(min_pos, -1);
        let left_label = format!("{}_left", active_tab_id);
        left_w.set_widget_name(&left_label);
        paned.pack1(&left_w, true, false);

        right_w.set_margin_start(0);
        right_w.set_margin_top(0);
        right_w.set_margin_end(0);
        right_w.set_margin_bottom(0);
        right_w.set_halign(gtk::Align::Fill);
        right_w.set_valign(gtk::Align::Fill);
        right_w.set_hexpand(true);
        right_w.set_vexpand(true);
        right_w.set_opacity(1.0);
        right_w.set_size_request(min_pos, -1);
        let right_label = format!("{}_right", active_tab_id);
        right_w.set_widget_name(&right_label);
        paned.pack2(&right_w, true, false);

        let app_paned = app_handle.clone();
        let tab_id_paned = active_tab_id.clone();
        let last_ratio = std::sync::Arc::new(std::sync::Mutex::new(ratio));
        let is_clamping = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let is_clamping_clone = is_clamping.clone();
        paned.connect_notify(Some("position"), move |p, _| {
            if is_fullscreen() || is_clamping_clone.load(std::sync::atomic::Ordering::Relaxed) {
                return;
            }
            let pos = p.position();
            let total_width = p.allocated_width();
            if total_width > 50 && pos > 0 {
                let min_pos = ((total_width as f64) * MIN_SPLIT_RATIO).round() as i32;
                let max_pos = ((total_width as f64) * MAX_SPLIT_RATIO).round() as i32;
                let clamped_pos = pos.clamp(min_pos, max_pos);
                if pos != clamped_pos {
                    is_clamping_clone.store(true, std::sync::atomic::Ordering::Relaxed);
                    p.set_position(clamped_pos);
                    is_clamping_clone.store(false, std::sync::atomic::Ordering::Relaxed);
                }
                let ratio = ((clamped_pos as f64) / (total_width as f64))
                    .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
                let mut last = last_ratio.lock().unwrap();
                if (ratio - *last).abs() >= 0.005 {
                    *last = ratio;
                    crate::core::webview::split::set_tab_split_ratio(&tab_id_paned, ratio);
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

        paned.connect_size_allocate(|p, alloc| {
            if is_fullscreen() {
                return;
            }
            let total_width = alloc.width();
            if total_width > 50 {
                let min_pos = ((total_width as f64) * MIN_SPLIT_RATIO).round() as i32;
                if let Some(c1) = p.child1() {
                    c1.set_size_request(min_pos, -1);
                }
                if let Some(c2) = p.child2() {
                    c2.set_size_request(min_pos, -1);
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
        overlay.set_overlay_pass_through(&paned, false);
        paned.set_opacity(1.0);

        left_w.show_all();
        left_w.show();
        right_w.show_all();
        right_w.show();
        paned.show_all();
        paned.show();
        paned.queue_resize();
        paned.queue_draw();

        ensure_overlay_layer_on_top(&overlay);

        Ok(true)
    })
}

pub fn remove_tab_view(app: &AppHandle, tab_id: &str) -> Result<bool, String> {
    let app_handle = app.clone();
    let tab_id = tab_id.to_string();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let mut remaining_tabs = 0;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                    if child.widget_name().as_str() == tab_id.as_str() {
                        overlay.remove(&child);
                    } else {
                        remaining_tabs += 1;
                    }
                }
            }
            ensure_overlay_layer_on_top(&overlay);
        }
        Ok(remaining_tabs > 0)
    })
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
                    if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
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
    save_last_bounds(bounds);
    if is_fullscreen() {
        return Ok(());
    }
    let app_handle = app.clone();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
            let alloc_w = if overlay.allocated_width() > 0 { overlay.allocated_width() } else { win_w };
            let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
                    child.set_margin_start(bounds.x as i32);
                    child.set_margin_top(bounds.y as i32);
                    child.set_margin_end(margin_end);
                    if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                        let total_w = if paned.allocated_width() > 0 { paned.allocated_width() } else { bounds.width as i32 };
                        let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
                        let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
                        let ratio = bounds.split_ratio.unwrap_or_else(|| {
                            let tab_name = child.widget_name().to_string();
                            crate::core::webview::split::get_tab_split_ratio(&tab_name)
                        }).clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
                        let target_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
                        paned.set_position(target_pos);
                        if let Some(c1) = paned.child1() {
                            c1.set_size_request(min_pos, -1);
                        }
                        if let Some(c2) = paned.child2() {
                            c2.set_size_request(min_pos, -1);
                        }
                    }
                    child.queue_resize();
                }
            }
            ensure_overlay_layer_on_top(&overlay);
        }
        Ok(())
    })
}

pub fn cleanup_overlay(app: &AppHandle) -> Result<(), String> {
    let app_handle = app.clone();
    run_on_gtk_thread(app, move || {
        let window = app_handle.get_window("main").ok_or("Main window not found")?;
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        if let Some(overlay) = vbox.children().into_iter().find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok()) {
            let main_child = overlay.child();
            for child in overlay.children() {
                if main_child.as_ref() != Some(&child) && !is_overlay_layer(&child) {
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
    })
}

pub fn setup_glib_log_handler() {
    gtk::glib::log_set_default_handler(|log_domain, log_level, message| {
        if message.contains("WEBKIT_HARDWARE_ACCELERATION_POLICY_ON_DEMAND")
            || message.contains("gtk_window_set_titlebar() called on a realized window")
            || message.contains("webkit_settings_set_enable_dns_prefetching")
            || message.contains("webkit_settings_set_enable_offline_web_application_cache")
        {
            return;
        }
        gtk::glib::log_default_handler(log_domain, log_level, Some(message));
    });
}

pub fn init_gtk_overlay(app: &AppHandle) -> Result<(), String> {
    setup_glib_log_handler();

    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        use gtk::prelude::*;
        let provider = gtk::CssProvider::new();
        let css = "
            paned.split-paned > separator {
                background-color: #ffffff;
                border-left: 1px solid #ffffff;
                border-right: 1px solid #ffffff;
                min-width: 6px;
                margin: 0;
                transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
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

        crate::core::overlay::init_overlay_css();

        // Enable WebBrowser CacheModel on application startup for fast page loading
        use webkit2gtk::WebContextExt;
        if let Some(context) = webkit2gtk::WebContext::default() {
            context.set_cache_model(webkit2gtk::CacheModel::WebBrowser);
        }

        let _ = tx.send(());
    }).map_err(|e| e.to_string())?;
    let _ = rx.recv();

    ensure_overlay(app)
}

/// Called on the GTK main thread when a WebKitWebView emits `enter-fullscreen`.
pub fn enter_webview_fullscreen(app: &AppHandle, wv_widget: &gtk::Widget) {
    IS_FULLSCREEN.store(true, Ordering::SeqCst);

    let Some(window) = app.get_window("main") else { return };
    let Ok(vbox) = window.default_vbox() else { return };
    let Some(overlay) = vbox
        .children()
        .into_iter()
        .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
    else {
        return;
    };

    let main_child = overlay.child();
    for child in overlay.children() {
        if main_child.as_ref() == Some(&child) {
            continue;
        }
        if is_overlay_layer(&child) {
            child.hide();
            continue;
        }

        if &child == wv_widget || wv_widget.is_ancestor(&child) {
            child.set_margin_start(0);
            child.set_margin_top(0);
            child.set_margin_end(0);
            child.set_margin_bottom(0);

            if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                if let Some(c1) = paned.child1() {
                    if &c1 == wv_widget || wv_widget.is_ancestor(&c1) {
                        c1.set_size_request(0, -1);
                        if let Some(c2) = paned.child2() {
                            c2.hide();
                        }
                    } else if let Some(c2) = paned.child2() {
                        if &c2 == wv_widget || wv_widget.is_ancestor(&c2) {
                            c2.set_size_request(0, -1);
                            c1.hide();
                        }
                    }
                }
            }

            child.queue_resize();
            child.queue_draw();
        }
    }
}

/// Called on the GTK main thread when a WebKitWebView emits `leave-fullscreen`.
pub fn leave_webview_fullscreen(app: &AppHandle, wv_widget: &gtk::Widget) {
    IS_FULLSCREEN.store(false, Ordering::SeqCst);

    let Some(window) = app.get_window("main") else { return };
    let Ok(vbox) = window.default_vbox() else { return };
    let Some(overlay) = vbox
        .children()
        .into_iter()
        .find_map(|c| c.dynamic_cast::<gtk::Overlay>().ok())
    else {
        return;
    };

    let bounds_opt = last_bounds_lock().lock().ok().and_then(|g| *g);
    let main_child = overlay.child();

    for child in overlay.children() {
        if main_child.as_ref() == Some(&child) || is_overlay_layer(&child) {
            continue;
        }

        if &child == wv_widget || wv_widget.is_ancestor(&child) {
            if let Some(bounds) = bounds_opt {
                let win_w = window.inner_size().map(|s| s.width as i32).unwrap_or(0);
                let alloc_w = if overlay.allocated_width() > 0 {
                    overlay.allocated_width()
                } else {
                    win_w
                };
                let margin_end = (alloc_w - (bounds.x as i32 + bounds.width as i32)).max(0);
                child.set_margin_start(bounds.x as i32);
                child.set_margin_top(bounds.y as i32);
                child.set_margin_end(margin_end);
                child.set_margin_bottom(0);
            }

            if let Ok(paned) = child.clone().dynamic_cast::<gtk::Paned>() {
                if let Some(c1) = paned.child1() {
                    c1.show_all();
                    c1.show();
                }
                if let Some(c2) = paned.child2() {
                    c2.show_all();
                    c2.show();
                }
                if let Some(bounds) = bounds_opt {
                    let total_w = if paned.allocated_width() > 0 {
                        paned.allocated_width()
                    } else {
                        bounds.width as i32
                    };
                    let min_pos = ((total_w as f64) * MIN_SPLIT_RATIO) as i32;
                    let max_pos = ((total_w as f64) * MAX_SPLIT_RATIO) as i32;
                    let tab_name = paned.widget_name().to_string();
                    let ratio = bounds
                        .split_ratio
                        .unwrap_or_else(|| crate::core::webview::split::get_tab_split_ratio(&tab_name))
                        .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO);
                    let target_pos = (((total_w as f64) * ratio) as i32).clamp(min_pos, max_pos);
                    if let Some(c1) = paned.child1() {
                        c1.set_size_request(min_pos, -1);
                    }
                    if let Some(c2) = paned.child2() {
                        c2.set_size_request(min_pos, -1);
                    }
                    paned.set_position(target_pos);
                }
            }

            child.queue_resize();
            child.queue_draw();
        }
    }
}
