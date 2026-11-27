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

pub(super) fn attach_popup_handler(
    parent_wv: &webkit2gtk::WebView,
    app_handle: &AppHandle,
    tab_id: &str,
) {
    use gtk::prelude::*;
    use webkit2gtk::{
        NavigationPolicyDecisionExt, PolicyDecisionExt, URIRequestExt, WebViewExt,
    };

    let app_popup = app_handle.clone();
    let tab_id_popup = tab_id.to_string();

    parent_wv.connect_create(move |wv, nav_action| {
        if let Some(req) = nav_action.request() {
            if let Some(uri) = req.uri() {
                let uri_str = uri.as_str();
                if !uri_str.is_empty() && uri_str != "about:blank" {
                    let manager = crate::core::shield::get_shield_manager();
                    if manager.is_enabled() {
                        let (should_block, category) =
                            manager.check_url_categorized(uri_str, "", "subdocument");
                        if should_block || manager.is_aggressive_sandbox() {
                            crate::commands::shield::record_and_emit_block(
                                &app_popup,
                                &tab_id_popup,
                                uri_str,
                                Some(category),
                                1,
                            );
                            return None;
                        }
                    }
                }
            }
        }

        // Create a related WebView so window.opener, postMessage, cookies, and WebContext are shared
        let popup_wv = webkit2gtk::WebView::with_related_view(wv);

        let popup_win = gtk::Window::new(gtk::WindowType::Toplevel);
        popup_win.set_default_size(520, 680);
        popup_win.set_position(gtk::WindowPosition::CenterOnParent);
        if let Some(toplevel) = wv.toplevel() {
            if let Ok(parent_win) = toplevel.downcast::<gtk::Window>() {
                popup_win.set_transient_for(Some(&parent_win));
            }
        }

        let header = gtk::HeaderBar::new();
        header.set_show_close_button(true);
        header.set_title(Some("YoonSpace"));
        popup_win.set_titlebar(Some(&header));
        popup_win.set_title("YoonSpace");

        popup_win.add(&popup_wv);

        // Sync popup title & domain subtitle for OAuth security visibility
        let header_title = header.clone();
        let win_title = popup_win.clone();
        popup_wv.connect_title_notify(move |pv| {
            let title = pv
                .title()
                .map(|t| t.to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "YoonSpace".to_string());
            header_title.set_title(Some(&title));
            win_title.set_title(&title);
        });

        let header_uri = header.clone();
        popup_wv.connect_uri_notify(move |pv| {
            if let Some(uri) = pv.uri() {
                if let Ok(parsed) = url::Url::parse(uri.as_str()) {
                    if let Some(host) = parsed.host_str() {
                        header_uri.set_subtitle(Some(host));
                        return;
                    }
                }
            }
            header_uri.set_subtitle(None);
        });

        // Show when WebKit signals ready-to-show (and immediately map the widget)
        let win_ready = popup_win.clone();
        popup_wv.connect_ready_to_show(move |_| {
            win_ready.show_all();
            win_ready.present();
        });

        // Close window cleanly when page calls window.close()
        let win_close = popup_win.clone();
        popup_wv.connect_close(move |_| {
            win_close.close();
        });

        // Apply HTTPS upgrade inside the popup (matching main webview NavigationAction behavior)
        popup_wv.connect_decide_policy(move |pv, decision, decision_type| {
            if decision_type == webkit2gtk::PolicyDecisionType::NavigationAction {
                if let Some(nav_dec) =
                    decision.dynamic_cast_ref::<webkit2gtk::NavigationPolicyDecision>()
                {
                    #[allow(deprecated)]
                    let req_opt = nav_dec
                        .navigation_action()
                        .and_then(|na| na.request())
                        .or_else(|| nav_dec.request());
                    if let Some(req) = req_opt {
                        if let Some(uri) = req.uri() {
                            let uri_str = uri.as_str();
                            let manager = crate::core::shield::get_shield_manager();
                            if manager.is_enabled()
                                && manager.is_upgrade_https()
                                && uri_str.starts_with("http://")
                                && !uri_str.starts_with("http://localhost")
                                && !uri_str.starts_with("http://127.0.0.1")
                            {
                                let upgraded = format!("https://{}", &uri_str[7..]);
                                decision.ignore();
                                pv.load_uri(&upgraded);
                                return true;
                            }
                        }
                    }
                }
            }
            false
        });

        // Allow nested popups if an auth provider opens a secondary popup
        attach_popup_handler(&popup_wv, &app_popup, &tab_id_popup);

        popup_win.show_all();
        popup_win.present();

        Some(popup_wv.upcast())
    });
}
