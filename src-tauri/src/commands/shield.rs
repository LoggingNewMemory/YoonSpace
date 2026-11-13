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

use tauri::{command, AppHandle, Emitter, Manager};
use crate::core::config::ShieldSettings;
use crate::core::shield::{get_shield_manager, ShieldCategory, ShieldStats, TabBreakdown};

fn broadcast_shield_state(app: &AppHandle, settings: &ShieldSettings) {
    let eval_code = format!(
        r#"(function() {{
            window.__YOONSPACE_SHIELD_ENABLED__ = {};
            window.__YOONSPACE_SHIELD_TRACKERS__ = {};
            window.__YOONSPACE_SHIELD_HTTPS__ = {};
            window.__YOONSPACE_SHIELD_SANDBOX__ = {};
            if (!{}) {{
                var s1 = document.getElementById("yoonspace-shields-cosmetic");
                if (s1) s1.remove();
                var s2 = document.getElementById("yoonspace-page-cosmetic");
                if (s2) s2.remove();
            }}
        }})();"#,
        settings.enabled, settings.block_trackers, settings.upgrade_https, settings.aggressive_sandbox, settings.enabled
    );
    for (_label, view) in app.webviews() {
        let _ = view.eval(&eval_code);
    }
}

#[command]
pub fn get_shield_stats() -> ShieldStats {
    get_shield_manager().get_stats()
}

#[command]
pub fn update_shield_settings(app: AppHandle, settings: ShieldSettings) -> ShieldStats {
    let manager = get_shield_manager();
    let new_settings = manager.update_settings(settings);
    broadcast_shield_state(&app, &new_settings);
    manager.get_stats()
}

#[command]
pub fn toggle_shield(app: AppHandle, enabled: bool) -> bool {
    let manager = get_shield_manager();
    let settings = manager.set_enabled(enabled);
    broadcast_shield_state(&app, &settings);
    settings.enabled
}

#[command]
pub fn toggle_shield_trackers(app: AppHandle, enabled: bool) -> bool {
    let manager = get_shield_manager();
    let settings = manager.set_block_trackers(enabled);
    broadcast_shield_state(&app, &settings);
    settings.block_trackers
}

#[command]
pub fn toggle_shield_https(app: AppHandle, enabled: bool) -> bool {
    let manager = get_shield_manager();
    let settings = manager.set_upgrade_https(enabled);
    broadcast_shield_state(&app, &settings);
    settings.upgrade_https
}

#[command]
pub fn toggle_shield_sandbox(app: AppHandle, enabled: bool) -> bool {
    let manager = get_shield_manager();
    let settings = manager.set_aggressive_sandbox(enabled);
    broadcast_shield_state(&app, &settings);
    settings.aggressive_sandbox
}

#[derive(Clone, serde::Serialize)]
pub struct ShieldBlockEvent {
    pub tab_id: String,
    pub url: String,
    pub category: String,
    pub tab_count: u64,
    pub total_count: u64,
    pub tab_breakdown: TabBreakdown,
}

pub fn record_and_emit_block(
    app: &AppHandle,
    tab_id: &str,
    url: &str,
    category: Option<ShieldCategory>,
    count: u64,
) {
    let manager = get_shield_manager();
    let (tab_breakdown, cat) = manager.record_blocks(tab_id, url, category, count);
    let tab_count = tab_breakdown.total;
    let total_count = manager.get_stats().total_blocked;

    let root_id = if let Some(base) = tab_id.strip_suffix("_left") {
        base
    } else if let Some(base) = tab_id.strip_suffix("_right") {
        base
    } else {
        tab_id
    };

    let _ = app.emit("shield-blocked-event", ShieldBlockEvent {
        tab_id: root_id.to_string(),
        url: url.to_string(),
        category: format!("{:?}", cat).to_lowercase(),
        tab_count,
        total_count,
        tab_breakdown,
    });
}

#[command]
pub fn record_shield_block(app: AppHandle, tab_id: String, url: String, category: Option<String>) {
    let override_cat = match category.as_deref() {
        Some("tracker") => Some(ShieldCategory::Tracker),
        Some("miner") => Some(ShieldCategory::Miner),
        Some("ad") => Some(ShieldCategory::Ad),
        _ => None,
    };
    record_and_emit_block(&app, &tab_id, &url, override_cat, 1);
}

#[command]
pub fn get_tab_shield_count(tab_id: String) -> u64 {
    get_shield_manager().get_tab_count(&tab_id)
}

#[command]
pub fn get_tab_shield_breakdown(tab_id: String) -> TabBreakdown {
    get_shield_manager().get_tab_breakdown(&tab_id)
}

#[command]
pub fn check_shield_url(url: String, source_url: Option<String>, req_type: Option<String>) -> bool {
    let source = source_url.unwrap_or_else(|| url.clone());
    let rtype = req_type.unwrap_or_else(|| "other".to_string());
    get_shield_manager().check_url(&url, &source, &rtype)
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CosmeticResourcesResponse {
    pub hide_selectors: Vec<String>,
    pub injected_script: String,
    pub generichide: bool,
}

#[command]
pub fn get_cosmetic_resources(url: String) -> CosmeticResourcesResponse {
    let res = get_shield_manager().url_cosmetic_resources(&url);
    CosmeticResourcesResponse {
        hide_selectors: res.hide_selectors.into_iter().collect(),
        injected_script: res.injected_script,
        generichide: res.generichide,
    }
}
