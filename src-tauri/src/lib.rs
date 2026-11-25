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

use tauri::Manager;

pub mod commands;
pub mod core;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crate::core::webview::gtk_overlay::setup_glib_log_handler();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let _ = crate::core::webview::init_gtk_overlay(&app.handle());
            crate::core::download::init_global_download_handler(&app.handle());

            if let Some(main_win) = app.get_window("main") {
                let _ = main_win.show();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::window_minimize,
            commands::window::window_toggle_maximize,
            commands::window::window_close,
            commands::window::window_is_maximized,
            commands::window::window_start_dragging,
            commands::telemetry::get_telemetry,
            commands::webview::spawn_single_view,
            commands::webview::spawn_split,
            commands::webview::update_split_layout,
            commands::webview::set_split_ratio,
            commands::webview::navigate_split,
            commands::webview::navigate_tab,
            commands::webview::webview_go_back,
            commands::webview::webview_go_forward,
            commands::webview::webview_reload,
            commands::webview::check_split_active,
            commands::webview::hide_webviews,
            commands::webview::set_drag_mode,
            commands::webview::show_tab_view,
            commands::webview::minimize_split_pane,
            commands::webview::merge_tabs_to_split,
            commands::webview::close_tab,
            commands::webview::close_split,
            commands::webview::get_cache_info,
            commands::webview::clear_browser_cache,
            commands::webview::webview_media_command,
            commands::user_data::get_vault_stats,
            commands::user_data::list_saved_credentials,
            commands::user_data::save_credential,
            commands::user_data::delete_credential,
            commands::user_data::list_engineer_tokens,
            commands::user_data::save_engineer_token,
            commands::user_data::delete_engineer_token,
            commands::user_data::clear_vault_data,
            commands::user_data::clear_persistent_cookies,
            commands::config::get_app_config,
            commands::config::update_app_config,
            commands::config::set_media_volume,
            commands::bookmarks::list_bookmarks,
            commands::bookmarks::add_bookmark,
            commands::bookmarks::update_bookmark,
            commands::bookmarks::delete_bookmark,
            commands::bookmarks::get_cached_favicon,
            commands::bookmarks::resolve_site_logo,
            commands::bookmarks::clear_favicon_cache,
            commands::shield::get_shield_stats,
            commands::shield::update_shield_settings,
            commands::shield::toggle_shield,
            commands::shield::toggle_shield_trackers,
            commands::shield::toggle_shield_https,
            commands::shield::toggle_shield_sandbox,
            commands::shield::record_shield_block,
            commands::shield::get_tab_shield_count,
            commands::shield::get_tab_shield_breakdown,
            commands::shield::check_shield_url,
            commands::shield::get_cosmetic_resources,
            commands::download::get_downloads,
            commands::download::clear_downloads,
            commands::download::open_download_file,
            commands::download::open_download_dir,
            commands::download::select_download_dir,
            commands::download::cancel_download,
            commands::wallpaper::select_wallpaper_dir,
            commands::wallpaper::list_wallpaper_images,
            commands::wallpaper::load_wallpaper_image,
            commands::overlay::show_overlay_notification,
            commands::overlay::hide_overlay_notification,
            commands::overlay::set_overlay_right_offset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running yoonspace application");
}
