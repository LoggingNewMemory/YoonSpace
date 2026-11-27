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

use tauri::AppHandle;

use super::builder::WebviewLoadProgressPayload;
use super::gtk_overlay;
use super::popup::attach_popup_handler;

pub(super) fn configure_native_webview(app: &AppHandle, webview: &tauri::Webview, tab_id: &str) {
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

        // 1c. Enable WebBrowser CacheModel for aggressive disk & memory caching on the actual WebView context
        use webkit2gtk::WebContextExt;
        if let Some(context) = WebViewExt::context(&inner_wv) {
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
                use webkit2gtk::{ResponsePolicyDecisionExt, URIResponseExt};
                if let Some(resp_decision) = decision.dynamic_cast_ref::<webkit2gtk::ResponsePolicyDecision>() {
                    if let Some(resp) = resp_decision.response() {
                        let status = resp.status_code();
                        if status == 204 || status < 200 || status >= 300 {
                            return false;
                        }

                        // Always honor explicit Content-Disposition: attachment
                        let is_attachment = resp
                            .http_headers()
                            .and_then(|h| h.content_disposition())
                            .map(|(disp, _)| disp.eq_ignore_ascii_case("attachment"))
                            .unwrap_or(false);
                        if is_attachment {
                            decision.download();
                            return true;
                        }

                        // Download unsupported MIME types unless it's an empty/RPC stream response
                        if !resp_decision.is_mime_type_supported() {
                            let mime = resp
                                .mime_type()
                                .map(|m| m.to_string().to_ascii_lowercase())
                                .unwrap_or_default();
                            if !mime.is_empty()
                                && !matches!(
                                    mime.as_str(),
                                    "application/x-protobuf" | "application/grpc-web" | "application/vnd.yt-ump"
                                )
                            {
                                decision.download();
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

            let app_favicon = app_handle.clone();
            let tab_id_favicon = tab_id_str.clone();
            ucm.connect_script_message_received(Some("site_favicon"), move |_ucm, js_res| {
                if let Some(js_val) = js_res.js_value() {
                    use javascriptcore::ValueExt;
                    use tauri::Emitter;
                    let msg_str = js_val.to_str();
                    #[derive(serde::Deserialize)]
                    #[serde(rename_all = "camelCase")]
                    struct SiteFaviconPayload {
                        tab_id: Option<String>,
                        page_url: Option<String>,
                        icon_url: Option<String>,
                        title: Option<String>,
                    }
                    #[derive(Clone, serde::Serialize)]
                    struct FaviconCachedEvent {
                        tab_id: String,
                        url: String,
                        origin: String,
                        data_url: String,
                        icon_url: Option<String>,
                        title: Option<String>,
                        from_cache: bool,
                    }
                    if let Ok(payload) = serde_json::from_str::<SiteFaviconPayload>(msg_str.as_str()) {
                        let page_url = match payload.page_url {
                            Some(u) if u.starts_with("http://") || u.starts_with("https://") => u,
                            _ => return,
                        };
                        let target_tab = payload.tab_id.unwrap_or_else(|| tab_id_favicon.clone());

                        // Fast path: already cached on disk/memory -> emit immediately without any network fetch
                        if let Some(cached) = crate::core::favicon_cache::get_cached_favicon(&page_url) {
                            if !cached.data_url.is_empty() {
                                let _ = app_favicon.emit(
                                    "webview-favicon-cached",
                                    FaviconCachedEvent {
                                        tab_id: target_tab,
                                        url: page_url,
                                        origin: cached.origin,
                                        data_url: cached.data_url,
                                        icon_url: cached.icon_url,
                                        title: payload.title.or(cached.title),
                                        from_cache: true,
                                    },
                                );
                            }
                            return;
                        }

                        // Not cached yet: detect & cache in background thread
                        let app_bg = app_favicon.clone();
                        let cand_icon = payload.icon_url;
                        let cand_title = payload.title;
                        tauri::async_runtime::spawn_blocking(move || {
                            if let Ok(resolved) = crate::core::favicon_cache::resolve_site_logo(
                                &page_url,
                                cand_icon.as_deref(),
                                cand_title.as_deref(),
                                false,
                            ) {
                                if !resolved.data_url.is_empty() {
                                    let _ = app_bg.emit(
                                        "webview-favicon-cached",
                                        FaviconCachedEvent {
                                            tab_id: target_tab,
                                            url: page_url,
                                            origin: resolved.origin,
                                            data_url: resolved.data_url,
                                            icon_url: resolved.icon_url,
                                            title: resolved.title,
                                            from_cache: resolved.from_cache,
                                        },
                                    );
                                }
                            }
                        });
                    }
                }
            });
            let _ = ucm.register_script_message_handler("site_favicon");
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

        // 7. Rename "Save Image As..." to "Save Image" in the context menu
        inner_wv.connect_context_menu(move |_wv, context_menu, _event, hit_test_result| {
            use webkit2gtk::{
                ContextMenuAction, ContextMenuExt, ContextMenuItem, ContextMenuItemExt,
                HitTestResultExt,
            };

            if hit_test_result.context_is_image() {
                for (idx, item) in context_menu.items().iter().enumerate() {
                    if item.stock_action() == ContextMenuAction::DownloadImageToDisk {
                        let save_item = ContextMenuItem::from_stock_action_with_label(
                            ContextMenuAction::DownloadImageToDisk,
                            "Save Image",
                        );
                        context_menu.insert(&save_item, idx as i32);
                        context_menu.remove(item);
                        break;
                    }
                }
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

        // 10. Popup window support (e.g. OAuth / Sign in with Google, window.open)
        attach_popup_handler(&inner_wv, &app_handle, &tab_id_str);
    });
}
