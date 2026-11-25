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
use super::navigation::normalize_url;
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

fn configure_native_webview(app: &AppHandle, webview: &tauri::Webview, tab_id: &str) {
    use webkit2gtk::{
        CookieManagerExt, PolicyDecisionExt, SettingsExt, URIRequestExt,
        UserContentManagerExt, WebResourceExt, WebsiteDataManagerExt, WebViewExt,
    };
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
            settings.set_enable_page_cache(true);
            settings.set_enable_fullscreen(true);
        }

        // 1c. Enable WebBrowser CacheModel for aggressive disk & memory caching
        use webkit2gtk::WebContextExt;
        if let Some(context) = webkit2gtk::WebContext::default() {
            context.set_cache_model(webkit2gtk::CacheModel::WebBrowser);
        }
        if let Some(data_manager) = inner_wv.website_data_manager() {
            if let Some(cookie_mgr) = data_manager.cookie_manager() {
                let cookie_path = crate::core::user_data::get_cookies_db_path();
                if let Some(path_str) = cookie_path.to_str() {
                    cookie_mgr.set_persistent_storage(path_str, webkit2gtk::CookiePersistentStorage::Sqlite);
                }
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
                use webkit2gtk::NavigationPolicyDecisionExt;
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
                use webkit2gtk::{NavigationPolicyDecisionExt, WebViewExt};
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

            if decision_type == webkit2gtk::PolicyDecisionType::Response {
                use gtk::prelude::Cast;
                use webkit2gtk::ResponsePolicyDecisionExt;
                use webkit2gtk::URIResponseExt;
                if let Some(resp_decision) = decision.dynamic_cast_ref::<webkit2gtk::ResponsePolicyDecision>() {
                    if let Some(resp) = resp_decision.response() {
                        let status = resp.status_code();
                        // 204 No Content, non-success, or redirects must never trigger a file download
                        if status == 204 || status < 200 || status >= 300 {
                            decision.ignore();
                            return true;
                        }

                        let uri = resp.uri().map(|u| u.to_string()).unwrap_or_default();
                        let lower_uri = uri.to_lowercase();
                        // Telemetry, stats, beacons, service workers, or internal API calls must never download
                        if lower_uri.contains("generate_204")
                            || lower_uri.contains("/stats/")
                            || lower_uri.contains("/log")
                            || lower_uri.contains("/api/")
                            || lower_uri.contains("/youtubei/")
                            || lower_uri.starts_with("data:")
                            || lower_uri.starts_with("blob:")
                        {
                            decision.ignore();
                            return true;
                        }

                        let mime = resp.mime_type().map(|m| m.to_string().to_lowercase()).unwrap_or_default();
                        // Structured API formats, subtitles, or empty mime types are not file downloads
                        if mime == "application/json"
                            || mime == "application/x-protobuf"
                            || mime == "application/grpc-web"
                            || mime == "application/vnd.yt-ump"
                            || mime == "text/vtt"
                            || mime == "text/plain"
                            || mime.is_empty()
                        {
                            decision.ignore();
                            return true;
                        }

                        // If the server explicitly specifies Content-Disposition: attachment, honor it
                        let is_attachment = resp.http_headers().and_then(|h| h.content_disposition()).map(|(disp, _)| {
                            disp.to_lowercase() == "attachment"
                        }).unwrap_or(false);

                        if is_attachment {
                            decision.download();
                            return true;
                        }

                        // If MIME type is unsupported for inline viewing, only download if it's a real download target
                        if !resp_decision.is_mime_type_supported() {
                            let has_download_ext = crate::core::download::extract_extension_from_url(&uri).is_some();
                            let suggested_fn = resp.suggested_filename().map(|s| s.to_string()).unwrap_or_default();
                            let is_known_download = has_download_ext || (!suggested_fn.is_empty() && suggested_fn != "download");

                            if is_known_download {
                                decision.download();
                                return true;
                            } else {
                                decision.ignore();
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

            let app_media = app_handle.clone();
            let tab_id_media = tab_id_str.clone();
            ucm.connect_script_message_received(Some("media_state"), move |_ucm, js_res| {
                if let Some(js_val) = js_res.js_value() {
                    use javascriptcore::ValueExt;
                    use tauri::Emitter;
                    let msg_str = js_val.to_str();
                    #[derive(Clone, serde::Serialize, serde::Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct MediaStatePayload {
                        tab_id: Option<String>,
                        has_media: bool,
                        is_playing: bool,
                        current_time: f64,
                        duration: f64,
                        volume: f64,
                        muted: bool,
                        title: String,
                        artist: String,
                    }
                    if let Ok(mut payload) = serde_json::from_str::<MediaStatePayload>(msg_str.as_str()) {
                        if payload.tab_id.is_none() {
                            payload.tab_id = Some(tab_id_media.clone());
                        }
                        let _ = app_media.emit("webview-media-state", payload);
                    }
                }
            });
            let _ = ucm.register_script_message_handler("media_state");
        }

        // 5a. Load progress tracking via WebKitGTK estimated load progress
        let app_progress = app_handle.clone();
        let tab_id_progress = tab_id_str.clone();
        inner_wv.connect_estimated_load_progress_notify(move |wv| {
            use tauri::Emitter;
            use webkit2gtk::WebViewExt;
            let progress = wv.estimated_load_progress();
            let _ = app_progress.emit(
                "webview-load-progress",
                WebviewLoadProgressPayload {
                    tab_id: tab_id_progress.clone(),
                    progress,
                    status: if progress >= 1.0 { "finished".to_string() } else { "progress".to_string() },
                },
            );
        });

        // 5b. Load lifecycle events (Started, Finished) & interruption recovery
        let last_interrupted = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
        let last_clone = last_interrupted.clone();
        let app_load_event = app_handle.clone();
        let tab_id_load_event = tab_id_str.clone();

        inner_wv.connect_load_changed(move |wv, event| {
            use tauri::Emitter;
            use webkit2gtk::WebViewExt;
            match event {
                webkit2gtk::LoadEvent::Started => {
                    let _ = app_load_event.emit(
                        "webview-load-progress",
                        WebviewLoadProgressPayload {
                            tab_id: tab_id_load_event.clone(),
                            progress: wv.estimated_load_progress().max(0.1),
                            status: "started".to_string(),
                        },
                    );
                }
                webkit2gtk::LoadEvent::Finished => {
                    if let Ok(mut last) = last_clone.lock() {
                        last.clear();
                    }
                    let _ = app_load_event.emit(
                        "webview-load-progress",
                        WebviewLoadProgressPayload {
                            tab_id: tab_id_load_event.clone(),
                            progress: 1.0,
                            status: "finished".to_string(),
                        },
                    );
                }
                _ => {}
            }
        });

        let app_failed = app_handle.clone();
        let tab_id_failed = tab_id_str.clone();
        inner_wv.connect_load_failed(move |wv, _event, failing_uri, error| {
            use tauri::Emitter;
            let _ = app_failed.emit(
                "webview-load-progress",
                WebviewLoadProgressPayload {
                    tab_id: tab_id_failed.clone(),
                    progress: 1.0,
                    status: "failed".to_string(),
                },
            );
            if error.matches(webkit2gtk::PolicyError::FrameLoadInterruptedByPolicyChange)
                || error.message().contains("interrupted")
            {
                if crate::core::download::is_downloading_uri(failing_uri) {
                    return true;
                }
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

        // 7. Context menu media capture for "Save Image As..." tracking
        inner_wv.connect_context_menu(move |_wv, _context_menu, _event, hit_test_result| {
            crate::core::download::record_context_menu_event();
            use webkit2gtk::HitTestResultExt;
            if let Some(img_uri) = hit_test_result.image_uri() {
                crate::core::download::set_last_right_clicked_media(img_uri.as_str());
            } else if let Some(media_uri) = hit_test_result.media_uri() {
                crate::core::download::set_last_right_clicked_media(media_uri.as_str());
            } else if let Some(link_uri) = hit_test_result.link_uri() {
                crate::core::download::set_last_right_clicked_media(link_uri.as_str());
            }
            false
        });

        // 8. Attach download management to the webview's context
        if let Some(context) = inner_wv.context() {
            crate::core::download::attach_context_download_listener(&app_handle, &context);
        }

        // 9. HTML5 Fullscreen support (e.g. YouTube 'F' key or fullscreen button)
        let app_fs_enter = app_handle.clone();
        inner_wv.connect_enter_fullscreen(move |wv| {
            use gtk::prelude::Cast;
            gtk_overlay::enter_webview_fullscreen(&app_fs_enter, wv.upcast_ref());
            false
        });

        let app_fs_leave = app_handle.clone();
        inner_wv.connect_leave_fullscreen(move |wv| {
            use gtk::prelude::Cast;
            gtk_overlay::leave_webview_fullscreen(&app_fs_leave, wv.upcast_ref());
            false
        });
    });
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
    let blank_url: url::Url = "about:blank".parse().map_err(|e: url::ParseError| e.to_string())?;
    let app_title = app.clone();
    let app_load = app.clone();
    let tab_id_load = tab_id.clone();
    let shield_script = crate::core::shield::get_shield_injection_script(&tab_id);
    let media_script = get_media_observer_script(&tab_id);
    let builder = WebviewBuilder::new(&tab_id, WebviewUrl::External(blank_url))
        .initialization_script(&shield_script)
        .initialization_script(&media_script)
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
                let _ = app_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: tab_id_load.clone(),
                        progress: 0.12,
                        status: "started".to_string(),
                    },
                );
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
                let _ = app_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: tab_id_load.clone(),
                        progress: 1.0,
                        status: "finished".to_string(),
                    },
                );
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
    if let Some(view) = app.get_webview(&tab_id) {
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
    let left_media = get_media_observer_script(&left_label);
    let left_builder = WebviewBuilder::new(&left_label, WebviewUrl::External(blank_url.clone()))
        .initialization_script(&left_shield)
        .initialization_script(&left_media)
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
                let _ = app_left_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: format!("{}_left", tab_id_left),
                        progress: 0.12,
                        status: "started".to_string(),
                    },
                );
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
                let _ = app_left_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: format!("{}_left", tab_id_left),
                        progress: 1.0,
                        status: "finished".to_string(),
                    },
                );
                crate::core::shield::inject_page_cosmetics(&webview, &tab_id_left, payload.url().as_str());
            }
        });

    let app_right = app.clone();
    let app_right_load = app.clone();
    let tab_id_right = tab_id.clone();
    let right_shield = crate::core::shield::get_shield_injection_script(&right_label);
    let right_media = get_media_observer_script(&right_label);
    let right_builder = WebviewBuilder::new(&right_label, WebviewUrl::External(blank_url))
        .initialization_script(&right_shield)
        .initialization_script(&right_media)
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
                let _ = app_right_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: format!("{}_right", tab_id_right),
                        progress: 0.12,
                        status: "started".to_string(),
                    },
                );
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
                let _ = app_right_load.emit(
                    "webview-load-progress",
                    WebviewLoadProgressPayload {
                        tab_id: format!("{}_right", tab_id_right),
                        progress: 1.0,
                        status: "finished".to_string(),
                    },
                );
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

fn get_media_observer_script(tab_id: &str) -> String {
    let tab_id_escaped = tab_id.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        r##"(function() {{
  if (window.__YOONSPACE_MEDIA_OBSERVER__) return;
  window.__YOONSPACE_MEDIA_OBSERVER__ = true;
  const TAB_ID = "{tab_id}";
  let lastSnapshot = "";
  let timerId = null;

  function pickActiveMedia() {{
    const list = Array.from(document.querySelectorAll("video, audio"));
    if (list.length === 0) return null;
    const playing = list.find((m) => !m.paused && !m.ended && (m.readyState > 0 || m.currentTime > 0));
    if (playing) return playing;
    const withDuration = list.find((m) => Number.isFinite(m.duration) && m.duration > 0);
    return withDuration || list[0];
  }}

  function getMetadata() {{
    let title = "";
    let artist = "";
    try {{
      const ms = navigator.mediaSession && navigator.mediaSession.metadata;
      if (ms) {{
        title = ms.title || "";
        artist = ms.artist || "";
      }}
    }} catch (e) {{}}
    if (!title) {{
      const ytTitle = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string");
      if (ytTitle && ytTitle.textContent) title = ytTitle.textContent.trim();
    }}
    if (!title && document.title) {{
      title = document.title.replace(/^\(\d+\)\s*/, "").replace(/\s*-\s*YouTube$/, "").trim();
    }}
    if (!artist) {{
      const ytChannel = document.querySelector("#owner #channel-name a, ytd-channel-name a");
      if (ytChannel && ytChannel.textContent) artist = ytChannel.textContent.trim();
    }}
    return {{ title, artist }};
  }}

  function reportState(force) {{
    try {{
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.media_state;
      if (!handler) return;
      const m = pickActiveMedia();
      if (!m) {{
        const emptyPayload = {{
          tabId: TAB_ID,
          hasMedia: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          volume: 1,
          muted: false,
          title: "",
          artist: ""
        }};
        const key = JSON.stringify(emptyPayload);
        if (force || key !== lastSnapshot) {{
          lastSnapshot = key;
          handler.postMessage(key);
        }}
        return;
      }}

      const meta = getMetadata();
      const duration = Number.isFinite(m.duration) && m.duration > 0 ? m.duration : 0;
      const currentTime = Number.isFinite(m.currentTime) && m.currentTime >= 0 ? m.currentTime : 0;
      const isPlaying = !m.paused && !m.ended;
      const payload = {{
        tabId: TAB_ID,
        hasMedia: true,
        isPlaying,
        currentTime,
        duration,
        volume: Number.isFinite(m.volume) ? m.volume : 1,
        muted: Boolean(m.muted),
        title: meta.title || "",
        artist: meta.artist || ""
      }};
      const key = JSON.stringify(payload);
      if (force || key !== lastSnapshot) {{
        lastSnapshot = key;
        handler.postMessage(key);
      }}
    }} catch (e) {{}}
  }}

  function ensurePolling() {{
    if (timerId !== null) return;
    timerId = window.setInterval(() => {{
      const m = pickActiveMedia();
      if (m && (!m.paused && !m.ended)) {{
        reportState(false);
      }}
    }}, 350);
  }}

  const events = ["play", "playing", "pause", "ended", "loadedmetadata", "durationchange", "volumechange", "seeked", "timeupdate"];
  events.forEach((evt) => {{
    document.addEventListener(evt, () => {{
      reportState(evt !== "timeupdate");
      ensurePolling();
    }}, true);
  }});

  window.addEventListener("yt-navigate-finish", () => setTimeout(() => reportState(true), 250));
  window.addEventListener("popstate", () => setTimeout(() => reportState(true), 250));
  if (document.readyState === "complete" || document.readyState === "interactive") {{
    reportState(true);
    ensurePolling();
  }} else {{
    window.addEventListener("DOMContentLoaded", () => {{
      reportState(true);
      ensurePolling();
    }});
  }}
}})();"##,
        tab_id = tab_id_escaped
    )
}
