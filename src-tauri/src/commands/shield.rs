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
use crate::core::shield::{get_shield_manager, ShieldStats};

#[command]
pub fn get_shield_stats() -> ShieldStats {
    get_shield_manager().get_stats()
}

#[command]
pub fn toggle_shield(app: AppHandle, enabled: bool) -> bool {
    let manager = get_shield_manager();
    manager.set_enabled(enabled);
    let is_en = manager.is_enabled();

    // Propagate enabled state dynamically to all active Webviews
    let eval_code = format!(
        "window.__YOONSPACE_SHIELD_ENABLED__ = {}; if (!{}) {{ const s = document.getElementById('yoonspace-shields-cosmetic'); if (s) s.remove(); }}",
        is_en, is_en
    );
    for (_label, view) in app.webviews() {
        let _ = view.eval(&eval_code);
    }

    is_en
}

#[derive(Clone, serde::Serialize)]
pub struct ShieldBlockEvent {
    pub tab_id: String,
    pub url: String,
    pub tab_count: u64,
    pub total_count: u64,
}

#[command]
pub fn record_shield_block(app: AppHandle, tab_id: String, url: String) {
    let manager = get_shield_manager();
    manager.record_block(&tab_id, &url);
    let tab_count = manager.get_tab_count(&tab_id);
    let total_count = manager.get_stats().total_blocked;

    let _ = app.emit("shield-blocked-event", ShieldBlockEvent {
        tab_id,
        url,
        tab_count,
        total_count,
    });
}

#[command]
pub fn get_tab_shield_count(tab_id: String) -> u64 {
    get_shield_manager().get_tab_count(&tab_id)
}
