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

use crate::core::download::DownloadItem;

pub const OVERLAY_LAYER_NAME: &str = "yoonspace_overlay_layer";

static DISMISS_EPOCH: AtomicU64 = AtomicU64::new(0);
static RIGHT_OFFSET: AtomicI32 = AtomicI32::new(16);
const TOP_OFFSET: i32 = 116;

#[allow(dead_code)]
struct ActiveToastWidgets {
    download_id: Option<String>,
    card: gtk::EventBox,
    title_lbl: gtk::Label,
    msg_lbl: gtk::Label,
    info_lbl: Option<gtk::Label>,
    progress_bar: Option<gtk::ProgressBar>,
    actions_row: gtk::Box,
    last_update: Instant,
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

    let layer = gtk::Box::new(gtk::Orientation::Vertical, 8);
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
        }

        .yoonspace-toast-card,
        eventbox.yoonspace-toast-card {
            background-color: transparent;
            background-image: none;
            border: none;
            min-width: 320px;
            max-width: 380px;
        }

        .yoonspace-toast-title,
        .yoonspace-toast-title-error,
        .yoonspace-toast-message,
        .yoonspace-toast-info,
        .yoonspace-toast-action-btn,
        .yoonspace-toast-close-btn {
            font-family: 'Google Sans', 'Google Sans Text', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Ubuntu', 'Noto Sans', sans-serif;
        }

        .yoonspace-toast-title {
            color: #ffffff;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: -0.15px;
        }

        .yoonspace-toast-title-error {
            color: #ff5449;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: -0.15px;
        }

        .yoonspace-toast-message {
            color: #a09e9d;
            font-size: 12px;
            font-weight: 400;
            margin-top: 1px;
        }

        .yoonspace-toast-info {
            color: #f85e2a;
            font-size: 11px;
            font-weight: 600;
            margin-top: 2px;
        }

        button.yoonspace-toast-action-btn,
        .yoonspace-toast-action-btn {
            background-color: #25252b;
            background-image: none;
            box-shadow: none;
            text-shadow: none;
            border: 1px solid #36363f;
            border-radius: 8px;
            color: #e2bfb4;
            font-size: 11.5px;
            font-weight: 600;
            padding: 5px 14px;
            min-height: 26px;
            outline-style: none;
            outline-width: 0;
            transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
        }

        button.yoonspace-toast-action-btn:hover,
        .yoonspace-toast-action-btn:hover {
            background-color: #34343c;
            border-color: #4a4a55;
            color: #ffffff;
        }

        button.yoonspace-toast-action-btn:active,
        .yoonspace-toast-action-btn:active {
            background-color: #40404a;
            color: #ffffff;
        }

        button.yoonspace-toast-close-btn,
        .yoonspace-toast-close-btn {
            background-color: transparent;
            background-image: none;
            box-shadow: none;
            text-shadow: none;
            border: none;
            border-width: 0;
            border-style: none;
            color: #8e8d91;
            font-size: 13px;
            font-weight: 500;
            padding: 2px 6px;
            min-height: 20px;
            min-width: 20px;
            border-radius: 6px;
            outline-style: none;
            outline-width: 0;
            transition: background-color 150ms ease, color 150ms ease;
        }

        button.yoonspace-toast-close-btn:hover,
        .yoonspace-toast-close-btn:hover {
            background-color: rgba(255, 255, 255, 0.08);
            color: #ffffff;
        }

        progressbar.yoonspace-toast-progress {
            min-height: 4px;
            border-radius: 2px;
            background-color: transparent;
            border: none;
            box-shadow: none;
            padding: 0;
            margin-top: 4px;
            margin-bottom: 2px;
        }

        progressbar.yoonspace-toast-progress trough {
            min-height: 4px;
            border-radius: 2px;
            background-color: #28282e;
            border: none;
            box-shadow: none;
        }

        progressbar.yoonspace-toast-progress progress {
            min-height: 4px;
            border-radius: 2px;
            background-color: #f85e2a;
            border: none;
            box-shadow: none;
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

fn draw_rounded_rect(cr: &gtk::cairo::Context, x: f64, y: f64, width: f64, height: f64, radius: f64) {
    use std::f64::consts::PI;
    let degrees = PI / 180.0;
    cr.new_sub_path();
    cr.arc(x + width - radius, y + radius, radius, -90.0 * degrees, 0.0 * degrees);
    cr.arc(x + width - radius, y + height - radius, radius, 0.0 * degrees, 90.0 * degrees);
    cr.arc(x + radius, y + height - radius, radius, 90.0 * degrees, 180.0 * degrees);
    cr.arc(x + radius, y + radius, radius, 180.0 * degrees, 270.0 * degrees);
    cr.close_path();
}

fn create_card_eventbox(title_text: &str) -> (gtk::EventBox, gtk::Box, gtk::Label, gtk::Label, gtk::Button) {
    let card = gtk::EventBox::new();
    card.set_visible_window(true);
    card.set_app_paintable(true);
    card.style_context().add_class("yoonspace-toast-card");
    card.set_size_request(330, -1);

    card.connect_draw(|widget, cr| {
        let width = widget.allocated_width() as f64;
        let height = widget.allocated_height() as f64;
        let radius = 16.0;

        // 1. Soft subtle multi-pass drop shadow
        for i in 1..=3 {
            let spread = i as f64;
            draw_rounded_rect(cr, 1.0, 1.0 + spread * 0.6, width - 2.0, height - 2.0, radius);
            cr.set_source_rgba(0.0, 0.0, 0.0, 0.08 / spread);
            let _ = cr.stroke();
        }

        // 2. Rich dark background (#17171a, 98% opacity) matching YoonSpace dark palette
        draw_rounded_rect(cr, 0.5, 0.5, width - 1.0, height - 1.0, radius);
        cr.set_source_rgba(0.09, 0.09, 0.10, 0.98);
        let _ = cr.fill_preserve();

        // 3. Crisp subtle border (#2e2e34)
        cr.set_source_rgba(0.18, 0.18, 0.20, 1.0);
        cr.set_line_width(1.0);
        let _ = cr.stroke();

        gtk::glib::Propagation::Proceed
    });

    let main_col = gtk::Box::new(gtk::Orientation::Vertical, 3);
    main_col.set_margin_start(16);
    main_col.set_margin_end(14);
    main_col.set_margin_top(13);
    main_col.set_margin_bottom(14);

    // Row 1: Header (Title + Close Button)
    let header_row = gtk::Box::new(gtk::Orientation::Horizontal, 8);

    let title_lbl = gtk::Label::new(Some(title_text));
    title_lbl.set_halign(gtk::Align::Start);
    title_lbl.set_hexpand(true);
    title_lbl.style_context().add_class("yoonspace-toast-title");
    header_row.pack_start(&title_lbl, true, true, 0);

    let close_btn = gtk::Button::with_label("✕");
    close_btn.set_halign(gtk::Align::End);
    close_btn.set_valign(gtk::Align::Start);
    close_btn.style_context().add_class("yoonspace-toast-close-btn");
    header_row.pack_end(&close_btn, false, false, 0);

    main_col.pack_start(&header_row, false, false, 0);

    // Row 2: Filename / Message
    let msg_lbl = gtk::Label::new(None);
    msg_lbl.set_halign(gtk::Align::Start);
    msg_lbl.set_ellipsize(gtk::pango::EllipsizeMode::End);
    msg_lbl.set_max_width_chars(32);
    msg_lbl.style_context().add_class("yoonspace-toast-message");
    main_col.pack_start(&msg_lbl, false, false, 0);

    card.add(&main_col);
    (card, main_col, title_lbl, msg_lbl, close_btn)
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
        for child in layer.children() {
            layer.remove(&child);
        }
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

        for child in layer.children() {
            layer.remove(&child);
        }

        let (card, content, title_lbl, msg_lbl, close_btn) = create_card_eventbox("Downloading...");
        msg_lbl.set_text(&item_clone.filename);

        let app_close = app_handle.clone();
        close_btn.connect_clicked(move |_| {
            hide_notification_internal(&app_close);
        });

        // Progress Bar
        let progress_bar = gtk::ProgressBar::new();
        progress_bar.set_fraction(item_clone.progress.clamp(0.0, 1.0));
        progress_bar.style_context().add_class("yoonspace-toast-progress");
        content.pack_start(&progress_bar, false, false, 3);

        // Info Label
        let info_text = if item_clone.total_bytes > 0 {
            format!(
                "{} / {} ({:.0}%)",
                format_file_size(item_clone.received_bytes),
                format_file_size(item_clone.total_bytes),
                item_clone.progress * 100.0
            )
        } else {
            format!("Downloaded {}", format_file_size(item_clone.received_bytes))
        };
        let info_lbl = gtk::Label::new(Some(&info_text));
        info_lbl.set_halign(gtk::Align::Start);
        info_lbl.style_context().add_class("yoonspace-toast-info");
        content.pack_start(&info_lbl, false, false, 0);

        // Action row: Cancel button
        let actions_row = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        actions_row.set_margin_top(6);
        let cancel_btn = gtk::Button::with_label("Cancel");
        cancel_btn.style_context().add_class("yoonspace-toast-action-btn");
        let app_cancel = app_handle.clone();
        let dl_id_cancel = item_clone.id.clone();
        cancel_btn.connect_clicked(move |_| {
            let _ = crate::core::download::cancel_download_by_id(&app_cancel, &dl_id_cancel);
            hide_notification_internal(&app_cancel);
        });
        actions_row.pack_start(&cancel_btn, false, false, 0);
        content.pack_start(&actions_row, false, false, 0);

        layer.pack_start(&card, false, false, 0);
        card.show_all();
        card.show();
        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: Some(item_clone.id),
                card,
                title_lbl,
                msg_lbl,
                info_lbl: Some(info_lbl),
                progress_bar: Some(progress_bar),
                actions_row,
                last_update: Instant::now(),
            });
        });
    });
}

pub fn update_download_progress(app: &AppHandle, item: &DownloadItem) {
    let app_handle = app.clone();
    let item_clone = item.clone();

    let _ = app.run_on_main_thread(move || {
        ACTIVE_TOAST.with(|cell| {
            let mut borrow = cell.borrow_mut();
            if let Some(active) = borrow.as_mut() {
                if active.download_id.as_deref() == Some(&item_clone.id) {
                    if active.last_update.elapsed().as_millis() >= 120 {
                        active.last_update = Instant::now();

                        if let Some(ref pb) = active.progress_bar {
                            pb.set_fraction(item_clone.progress.clamp(0.0, 1.0));
                        }

                        if let Some(ref lbl) = active.info_lbl {
                            let info_text = if item_clone.total_bytes > 0 {
                                format!(
                                    "{} / {} ({:.0}%)",
                                    format_file_size(item_clone.received_bytes),
                                    format_file_size(item_clone.total_bytes),
                                    item_clone.progress * 100.0
                                )
                            } else {
                                format!("Downloaded {}", format_file_size(item_clone.received_bytes))
                            };
                            lbl.set_text(&info_text);
                        }

                        if !item_clone.filename.is_empty() && item_clone.filename != "download" {
                            active.msg_lbl.set_text(&item_clone.filename);
                        }
                    }
                    return;
                }
            }
        });

        // If no active toast or different download, ensure notification is showing
        ACTIVE_TOAST.with(|cell| {
            if cell.borrow().is_none() {
                show_download_notification(&app_handle, &item_clone);
            }
        });
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

        for child in layer.children() {
            layer.remove(&child);
        }

        let (card, content, title_lbl, msg_lbl, close_btn) = create_card_eventbox("Download Complete");
        msg_lbl.set_text(&item_clone.filename);

        let app_close = app_handle.clone();
        close_btn.connect_clicked(move |_| {
            hide_notification_internal(&app_close);
        });

        // Actions: Open and Show in Folder
        let actions_row = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        actions_row.set_margin_top(8);

        let open_btn = gtk::Button::with_label("Open");
        open_btn.style_context().add_class("yoonspace-toast-action-btn");
        let app_open = app_handle.clone();
        let dl_id_open = item_clone.id.clone();
        open_btn.connect_clicked(move |_| {
            let _ = crate::core::download::open_file_by_id(&dl_id_open);
            hide_notification_internal(&app_open);
        });
        actions_row.pack_start(&open_btn, false, false, 0);

        let folder_btn = gtk::Button::with_label("Show in Folder");
        folder_btn.style_context().add_class("yoonspace-toast-action-btn");
        let app_folder = app_handle.clone();
        let dest_folder = if !item_clone.destination.is_empty() {
            Path::new(&item_clone.destination)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| item_clone.destination.clone())
        } else {
            String::new()
        };
        folder_btn.connect_clicked(move |_| {
            let _ = crate::core::download::open_folder(&dest_folder);
            hide_notification_internal(&app_folder);
        });
        actions_row.pack_start(&folder_btn, false, false, 0);

        content.pack_start(&actions_row, false, false, 0);

        layer.pack_start(&card, false, false, 0);
        card.show_all();
        card.show();
        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        ACTIVE_TOAST.with(|cell| {
            *cell.borrow_mut() = Some(ActiveToastWidgets {
                download_id: Some(item_clone.id),
                card,
                title_lbl,
                msg_lbl,
                info_lbl: None,
                progress_bar: None,
                actions_row,
                last_update: Instant::now(),
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

        for child in layer.children() {
            layer.remove(&child);
        }

        let (card, _content, title_lbl, msg_lbl, close_btn) = create_card_eventbox("Download Failed");
        title_lbl.style_context().add_class("yoonspace-toast-title-error");

        let app_close = app_handle.clone();
        close_btn.connect_clicked(move |_| {
            hide_notification_internal(&app_close);
        });

        let msg_text = format!("{}: {}", item_clone.filename, item_clone.error.as_deref().unwrap_or("Network error"));
        msg_lbl.set_text(&msg_text);

        layer.pack_start(&card, false, false, 0);
        card.show_all();
        card.show();
        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

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

        for child in layer.children() {
            layer.remove(&child);
        }

        let (card, content, title_lbl, msg_lbl, close_btn) = create_card_eventbox(&title_str);
        if n_type_str == "error" {
            title_lbl.style_context().add_class("yoonspace-toast-title-error");
        }
        msg_lbl.set_text(&msg_str);

        let app_close = app_handle.clone();
        close_btn.connect_clicked(move |_| {
            hide_notification_internal(&app_close);
        });

        let actions_row = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        if let Some(ref id) = dl_id {
            actions_row.set_margin_top(8);
            let open_btn = gtk::Button::with_label("Open");
            open_btn.style_context().add_class("yoonspace-toast-action-btn");
            let app_open = app_handle.clone();
            let id_clone = id.clone();
            open_btn.connect_clicked(move |_| {
                let _ = crate::core::download::open_file_by_id(&id_clone);
                hide_notification_internal(&app_open);
            });
            actions_row.pack_start(&open_btn, false, false, 0);

            let folder_btn = gtk::Button::with_label("Show in Folder");
            folder_btn.style_context().add_class("yoonspace-toast-action-btn");
            let app_folder = app_handle.clone();
            folder_btn.connect_clicked(move |_| {
                let _ = crate::core::download::open_folder("");
                hide_notification_internal(&app_folder);
            });
            actions_row.pack_start(&folder_btn, false, false, 0);

            content.pack_start(&actions_row, false, false, 0);
        }

        layer.pack_start(&card, false, false, 0);
        card.show_all();
        card.show();
        layer.show_all();
        layer.show();
        overlay.reorder_overlay(&layer, -1);
        overlay.queue_draw();

        start_auto_dismiss(&app_handle, 5);
    });
}
