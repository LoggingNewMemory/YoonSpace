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

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

use super::gtk_overlay;
use super::split::{set_tab_split_ratio, SplitBounds, MAX_SPLIT_RATIO, MIN_SPLIT_RATIO};

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
                            if let Some(c1) = paned.child1() {
                                c1.set_size_request(min_pos, -1);
                            }
                            if let Some(c2) = paned.child2() {
                                c2.set_size_request(min_pos, -1);
                            }
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

    unsafe {
        malloc_trim(0);
    }

    Ok(())
}

pub fn execute_webview_media_command(
    app: &AppHandle,
    tab_id: Option<&str>,
    command: &str,
    value: Option<f64>,
) -> Result<(), String> {
    let script = match command {
        "play_pause" => r#"
            (() => {
                const media = Array.from(document.querySelectorAll('video, audio')).filter(m => !m.ended);
                if (media.length > 0) {
                    const playing = media.find(m => !m.paused);
                    if (playing) {
                        playing.pause();
                    } else {
                        media[0].play().catch(() => {});
                    }
                    return;
                }
                const yt = document.querySelector('.ytp-play-button');
                if (yt) { yt.click(); return; }
                const sp = document.querySelector('[data-testid="control-button-playpause"]');
                if (sp) { sp.click(); return; }
                const sc = document.querySelector('.playControl');
                if (sc) { sc.click(); return; }
            })();
        "#.to_string(),
        "play" => r#"
            (() => {
                const media = Array.from(document.querySelectorAll('video, audio'));
                for (const m of media) { m.play().catch(() => {}); }
                const yt = document.querySelector('.ytp-play-button');
                if (yt && yt.getAttribute('aria-label') && yt.getAttribute('aria-label').includes('Play')) {
                    yt.click();
                }
            })();
        "#.to_string(),
        "pause" => r#"
            (() => {
                const media = Array.from(document.querySelectorAll('video, audio'));
                for (const m of media) { m.pause(); }
                const yt = document.querySelector('.ytp-play-button');
                if (yt && yt.getAttribute('aria-label') && !yt.getAttribute('aria-label').includes('Play')) {
                    yt.click();
                }
            })();
        "#.to_string(),
        "next" => r#"
            (() => {
                const yt = document.querySelector('.ytp-next-button');
                if (yt) { yt.click(); return; }
                const sp = document.querySelector('[data-testid="control-button-skip-forward"]');
                if (sp) { sp.click(); return; }
                const sc = document.querySelector('.skipControl__next');
                if (sc) { sc.click(); return; }
                const v = document.querySelector('video, audio');
                if (v && Number.isFinite(v.currentTime)) {
                    v.currentTime = Math.min((v.duration || Infinity), v.currentTime + 10);
                }
            })();
        "#.to_string(),
        "prev" => r#"
            (() => {
                const yt = document.querySelector('.ytp-prev-button');
                if (yt) { yt.click(); return; }
                const sp = document.querySelector('[data-testid="control-button-skip-back"]');
                if (sp) { sp.click(); return; }
                const sc = document.querySelector('.skipControl__previous');
                if (sc) { sc.click(); return; }
                const v = document.querySelector('video, audio');
                if (v && Number.isFinite(v.currentTime)) {
                    v.currentTime = Math.max(0, v.currentTime - 10);
                }
            })();
        "#.to_string(),
        "seek" => {
            let val = value.unwrap_or(0.0);
            format!(r#"
                (() => {{
                    const v = document.querySelector('video, audio');
                    if (v && Number.isFinite(v.duration)) {{
                        const val = {};
                        if (val >= 0 && val <= 1) {{
                            v.currentTime = val * v.duration;
                        }} else {{
                            v.currentTime = Math.max(0, Math.min(v.duration, val));
                        }}
                    }}
                }})();
            "#, val)
        },
        "volume" => {
            let vol = value.unwrap_or(1.0).clamp(0.0, 1.0);
            format!(r#"
                (() => {{
                    const media = document.querySelectorAll('video, audio');
                    media.forEach(m => {{
                        m.volume = {};
                        m.muted = ({} === 0);
                    }});
                }})();
            "#, vol, vol)
        },
        "mute" => r#"
            (() => {
                const media = document.querySelectorAll('video, audio');
                media.forEach(m => { m.muted = !m.muted; });
                const ytMute = document.querySelector('.ytp-mute-button');
                if (ytMute) ytMute.click();
            })();
        "#.to_string(),
        "pip" => r#"
            (() => {
                const v = document.querySelector('video');
                if (v && document.pictureInPictureEnabled) {
                    if (document.pictureInPictureElement) {
                        document.exitPictureInPicture().catch(() => {});
                    } else {
                        v.requestPictureInPicture().catch(() => {});
                    }
                }
            })();
        "#.to_string(),
        _ => return Err(format!("Unknown media command: {}", command)),
    };

    if let Some(target) = tab_id {
        if let Some(view) = app.get_webview(target) {
            let _ = view.eval(&script);
            return Ok(());
        }
        let left_label = format!("{}_left", target);
        let right_label = format!("{}_right", target);
        let mut found = false;
        if let Some(view) = app.get_webview(&left_label) {
            let _ = view.eval(&script);
            found = true;
        }
        if let Some(view) = app.get_webview(&right_label) {
            let _ = view.eval(&script);
            found = true;
        }
        if found {
            return Ok(());
        }
        for (label, view) in app.webviews() {
            if label != "main" && (label.ends_with(&format!("_{}", target)) || label.contains(target)) {
                let _ = view.eval(&script);
                return Ok(());
            }
        }
    }

    for (label, view) in app.webviews() {
        if label != "main" {
            let _ = view.eval(&script);
        }
    }

    Ok(())
}
