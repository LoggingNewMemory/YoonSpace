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
//
// ACKNOWLEDGEMENT & ATTRIBUTION:
// YoonSpace Shields adblocking engine is powered directly by Brave Software's
// open-source `adblock-rust` engine (Mozilla Public License 2.0).
// Reference repository: <https://github.com/brave/adblock-rust>
// Copyright (c) Brave Software Inc. All rights reserved.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use adblock::cosmetic_filter_cache::UrlSpecificResources;
use adblock::Engine;
use adblock::lists::{FilterSet, ParseOptions};
use adblock::request::Request;
use adblock::resources::Resource;

use crate::core::config::{load_config, save_config, ShieldSettings};
use super::types::{BlockedItem, ShieldCategory, ShieldState, ShieldStats, SourceIndices, TabBreakdown};

const BRAVE_DATA_DIR: &str = "/home/yamada/CODE/BraveStuffs/adblock-rust/data/brave";
const EASYPRIVACY_PATH: &str = "/home/yamada/CODE/BraveStuffs/adblock-rust/data/easylist.to/easylist/easyprivacy.txt";

pub struct ShieldManager {
    engine: Mutex<Engine>,
    state: Mutex<ShieldState>,
    sources: SourceIndices,
    fast_domains_json: String,
    yt_scriptlet: String,
    yt_hide_selectors: Vec<String>,
}

static SHIELD_MANAGER: OnceLock<Arc<ShieldManager>> = OnceLock::new();

pub fn get_shield_manager() -> &'static Arc<ShieldManager> {
    SHIELD_MANAGER.get_or_init(|| {
        Arc::new(ShieldManager::new())
    })
}

fn get_cache_dir() -> PathBuf {
    let mut dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.push("yoonspace");
    let _ = fs::create_dir_all(&dir);
    dir
}

/// Classify a URL natively using Brave's adblock-rust engine and filter list source attribution.
pub fn classify_url(url: &str, req_type: &str) -> ShieldCategory {
    get_shield_manager().classify_url(url, req_type)
}

impl ShieldManager {
    pub fn new() -> Self {
        eprintln!("[YoonSpace Shield] Loading Brave adblock-rust from: {}", BRAVE_DATA_DIR);

        let data_dir = Path::new(BRAVE_DATA_DIR);
        let list_path = data_dir.join("brave-main-list.txt");
        let unbreak_path = data_dir.join("brave-unbreak.txt");
        let miners_path = data_dir.join("coin-miners.txt");
        let res_path = data_dir.join("brave-resources.json");

        let privacy_path = Path::new(EASYPRIVACY_PATH);
        let fallback_privacy = Path::new("/home/yamada/CODE/BraveStuffs/adblock-rust/data/regression-testing/easyprivacy.txt");
        let privacy_file = if privacy_path.exists() {
            privacy_path
        } else {
            fallback_privacy
        };

        // 1. Load resources directly from Brave adblock-rust
        let res_str = fs::read_to_string(&res_path)
            .unwrap_or_else(|e| panic!("Failed to read Brave resources at {:?}: {}", res_path, e));
        let resources: Vec<Resource> = serde_json::from_str(&res_str)
            .unwrap_or_else(|e| panic!("Failed to parse Brave resources JSON: {}", e));

        // 2. Check engine cache to boot in ~10ms
        let cache_dir = get_cache_dir();
        let engine_cache_file = cache_dir.join("shield_engine_v2.dat");
        let meta_cache_file = cache_dir.join("shield_engine_v2.meta");

        let mut total_size = fs::metadata(&list_path).map(|m| m.len()).unwrap_or(0);
        if miners_path.exists() {
            total_size += fs::metadata(&miners_path).map(|m| m.len()).unwrap_or(0);
        }
        if privacy_file.exists() {
            total_size += fs::metadata(privacy_file).map(|m| m.len()).unwrap_or(0);
        }
        if unbreak_path.exists() {
            total_size += fs::metadata(&unbreak_path).map(|m| m.len()).unwrap_or(0);
        }

        let mut engine_opt: Option<Engine> = None;
        if engine_cache_file.exists() && meta_cache_file.exists() {
            if let Ok(meta_str) = fs::read_to_string(&meta_cache_file) {
                if meta_str.trim() == total_size.to_string() {
                    if let Ok(cache_bytes) = fs::read(&engine_cache_file) {
                        let mut cached = Engine::default();
                        if cached.deserialize(&cache_bytes).is_ok() {
                            cached.use_resources(resources.clone());
                            eprintln!("[YoonSpace Shield] Loaded pre-compiled Brave engine from cache in ~10ms.");
                            engine_opt = Some(cached);
                        }
                    }
                }
            }
        }

        // 3. Read list sources
        let list_str = fs::read_to_string(&list_path)
            .unwrap_or_else(|e| panic!("Failed to read {:?}: {}", list_path, e));
        let privacy_str = fs::read_to_string(privacy_file).unwrap_or_default();
        let miners_str = fs::read_to_string(&miners_path).unwrap_or_default();

        // Lists are added in deterministic order:
        // 0: EasyPrivacy (Trackers)
        // 1: NoCoin (Miners)
        // 2: Brave Main List (Ads)
        // 3: Brave Unbreak (Exceptions)
        let sources = SourceIndices {
            tracker_idx: 0,
            miner_idx: 1,
            ad_idx: 2,
        };

        let engine = match engine_opt {
            Some(e) => e,
            None => {
                let mut filter_set = FilterSet::new(true);

                if !privacy_str.is_empty() {
                    filter_set.add_filter_list(privacy_str.clone(), ParseOptions::default());
                }

                if !miners_str.is_empty() {
                    filter_set.add_filter_list(miners_str.clone(), ParseOptions::default());
                }

                filter_set.add_filter_list(list_str.clone(), ParseOptions::default());

                if unbreak_path.exists() {
                    if let Ok(unbreak_str) = fs::read_to_string(&unbreak_path) {
                        filter_set.add_filter_list(unbreak_str, ParseOptions::default());
                    }
                }

                let mut built = Engine::new_with_filter_set(filter_set);
                built.use_resources(resources.clone());

                let serialized = built.serialize();
                let _ = fs::write(&engine_cache_file, &serialized);
                let _ = fs::write(&meta_cache_file, total_size.to_string());
                eprintln!("[YoonSpace Shield] Compiled Brave adblock filter list ({} bytes) and cached engine.", serialized.len());
                built
            }
        };

        // 4. Extract fast domain rules with category classifications directly from adblock-rust filter lists
        let mut fast_domains_map: HashMap<String, &'static str> = HashMap::with_capacity(4000);
        let parse_fast = |content: &str, target: &mut HashMap<String, &'static str>, category: &'static str, max_add: usize| {
            let mut added = 0;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("||") && trimmed.ends_with('^') && !trimmed.contains('/') && !trimmed.contains('*') && !trimmed.contains('$') && !trimmed.contains(':') {
                    let domain = &trimmed[2..trimmed.len() - 1];
                    if !domain.is_empty() {
                        target.insert(domain.to_lowercase(), category);
                        added += 1;
                        if added >= max_add {
                            break;
                        }
                    }
                }
            }
        };

        if !privacy_str.is_empty() {
            parse_fast(&privacy_str, &mut fast_domains_map, "tracker", 1500);
        }
        if !miners_str.is_empty() {
            parse_fast(&miners_str, &mut fast_domains_map, "miner", 500);
        }
        parse_fast(&list_str, &mut fast_domains_map, "ad", 2000);

        let fast_domains_json = serde_json::to_string(&fast_domains_map).unwrap_or_else(|_| "{}".to_string());

        // 5. Query official Brave cosmetic resources and scriptlets for YouTube from adblock-rust
        let yt_cosmetic = engine.url_cosmetic_resources("https://www.youtube.com/watch?v=test");
        let yt_scriptlet = yt_cosmetic.injected_script;
        let yt_hide_selectors: Vec<String> = yt_cosmetic
            .hide_selectors
            .into_iter()
            .filter(|s| !s.trim().is_empty())
            .collect();

        eprintln!(
            "[YoonSpace Shield] adblock-rust ready: {} fast domains, {} bytes YouTube scriptlets, {} selectors",
            fast_domains_map.len(),
            yt_scriptlet.len(),
            yt_hide_selectors.len()
        );

        let initial_cfg = load_config();
        let settings = initial_cfg.shield_settings;

        Self {
            engine: Mutex::new(engine),
            state: Mutex::new(ShieldState {
                settings,
                total_blocked: 0,
                total_breakdown: TabBreakdown::default(),
                tab_blocked: HashMap::new(),
                tab_breakdown: HashMap::new(),
                recent_blocked: Vec::new(),
            }),
            sources,
            fast_domains_json,
            yt_scriptlet,
            yt_hide_selectors,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.state.lock().map(|s| s.settings.enabled).unwrap_or(true)
    }

    pub fn is_block_trackers(&self) -> bool {
        self.state.lock().map(|s| s.settings.block_trackers).unwrap_or(true)
    }

    pub fn is_upgrade_https(&self) -> bool {
        self.state.lock().map(|s| s.settings.upgrade_https).unwrap_or(true)
    }

    pub fn is_aggressive_sandbox(&self) -> bool {
        self.state.lock().map(|s| s.settings.aggressive_sandbox).unwrap_or(false)
    }

    pub fn get_settings(&self) -> ShieldSettings {
        self.state.lock().map(|s| s.settings.clone()).unwrap_or_default()
    }

    pub fn update_settings(&self, new_settings: ShieldSettings) -> ShieldSettings {
        if let Ok(mut state) = self.state.lock() {
            state.settings = new_settings.clone();
        }
        let mut cfg = load_config();
        cfg.shield_settings = new_settings.clone();
        let _ = save_config(&cfg);
        new_settings
    }

    pub fn set_enabled(&self, enabled: bool) -> ShieldSettings {
        let mut settings = self.get_settings();
        settings.enabled = enabled;
        self.update_settings(settings)
    }

    pub fn set_block_trackers(&self, enabled: bool) -> ShieldSettings {
        let mut settings = self.get_settings();
        settings.block_trackers = enabled;
        self.update_settings(settings)
    }

    pub fn set_upgrade_https(&self, enabled: bool) -> ShieldSettings {
        let mut settings = self.get_settings();
        settings.upgrade_https = enabled;
        self.update_settings(settings)
    }

    pub fn set_aggressive_sandbox(&self, enabled: bool) -> ShieldSettings {
        let mut settings = self.get_settings();
        settings.aggressive_sandbox = enabled;
        self.update_settings(settings)
    }

    fn heuristic_category(&self, url: &str) -> ShieldCategory {
        let lower = url.to_lowercase();
        if lower.contains("coin") || lower.contains("miner") || lower.contains("cryptoloot") || lower.contains("monero") {
            ShieldCategory::Miner
        } else if lower.contains("analytics") || lower.contains("telemetry") || lower.contains("tracking")
            || lower.contains("tracker") || lower.contains("pixel") || lower.contains("beacon")
            || lower.contains("tagmanager") || lower.contains("facebook.net/tr")
        {
            ShieldCategory::Tracker
        } else {
            ShieldCategory::Ad
        }
    }

    /// Check if a network request should be blocked according to the Brave adblock-rust engine and category settings.
    pub fn check_url(&self, url: &str, source_url: &str, req_type: &str) -> bool {
        self.check_url_categorized(url, source_url, req_type).0
    }

    /// Query Brave adblock-rust engine to check if a URL should be blocked, attributing the category
    /// directly from the matching filter rule and filter source.
    pub fn check_url_categorized(&self, url: &str, source_url: &str, req_type: &str) -> (bool, ShieldCategory) {
        let (enabled, block_trackers) = if let Ok(state) = self.state.lock() {
            (state.settings.enabled, state.settings.block_trackers)
        } else {
            (true, true)
        };

        if !enabled {
            return (false, ShieldCategory::Ad);
        }

        if let Ok(req) = Request::new(url, source_url, req_type, "GET") {
            if let Ok(engine) = self.engine.lock() {
                let res = engine.check_network_request(&req);
                if res.should_block() {
                    let category = if let Some(debug_info) = &res.filter {
                        if let Some(loc) = &debug_info.source_location {
                            if loc.source_index == self.sources.tracker_idx {
                                ShieldCategory::Tracker
                            } else if loc.source_index == self.sources.miner_idx {
                                ShieldCategory::Miner
                            } else {
                                ShieldCategory::Ad
                            }
                        } else {
                            self.heuristic_category(url)
                        }
                    } else {
                        self.heuristic_category(url)
                    };

                    // If user disabled tracker blocking and this was identified by adblock-rust as a tracker:
                    if category == ShieldCategory::Tracker && !block_trackers {
                        return (false, category);
                    }

                    return (true, category);
                }
            }
        }

        (false, ShieldCategory::Ad)
    }

    pub fn classify_url(&self, url: &str, req_type: &str) -> ShieldCategory {
        self.check_url_categorized(url, "", req_type).1
    }

    /// Query adblock-rust for cosmetic CSS hide selectors and scriptlets for any given URL.
    pub fn url_cosmetic_resources(&self, url: &str) -> UrlSpecificResources {
        if let Ok(engine) = self.engine.lock() {
            engine.url_cosmetic_resources(url)
        } else {
            UrlSpecificResources::empty()
        }
    }

    pub fn record_blocks(&self, tab_id: &str, url: &str, override_category: Option<ShieldCategory>, count: u64) -> (TabBreakdown, ShieldCategory) {
        let count = count.max(1);
        let category = override_category.unwrap_or_else(|| self.classify_url(url, "other"));
        let root_id = if let Some(base) = tab_id.strip_suffix("_left") {
            base
        } else if let Some(base) = tab_id.strip_suffix("_right") {
            base
        } else {
            tab_id
        };

        let mut tab_breakdown = TabBreakdown::default();

        if let Ok(mut state) = self.state.lock() {
            state.total_blocked += count;
            state.total_breakdown.total += count;
            match category {
                ShieldCategory::Tracker => {
                    state.total_breakdown.trackers += count;
                }
                ShieldCategory::Miner => {
                    state.total_breakdown.miners += count;
                }
                ShieldCategory::Ad => {
                    state.total_breakdown.ads += count;
                }
            }

            *state.tab_blocked.entry(tab_id.to_string()).or_insert(0) += count;
            let tab_stat = state.tab_breakdown.entry(tab_id.to_string()).or_default();
            tab_stat.total += count;
            match category {
                ShieldCategory::Tracker => {
                    tab_stat.trackers += count;
                }
                ShieldCategory::Miner => {
                    tab_stat.miners += count;
                }
                ShieldCategory::Ad => {
                    tab_stat.ads += count;
                }
            }

            let left_id = format!("{}_left", root_id);
            let right_id = format!("{}_right", root_id);
            let main_stat = state.tab_breakdown.get(root_id).cloned().unwrap_or_default();
            let left_stat = state.tab_breakdown.get(&left_id).cloned().unwrap_or_default();
            let right_stat = state.tab_breakdown.get(&right_id).cloned().unwrap_or_default();

            tab_breakdown = TabBreakdown {
                total: main_stat.total + left_stat.total + right_stat.total,
                trackers: main_stat.trackers + left_stat.trackers + right_stat.trackers,
                ads: main_stat.ads + left_stat.ads + right_stat.ads,
                miners: main_stat.miners + left_stat.miners + right_stat.miners,
            };

            let domain = url::Url::parse(url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| {
                    if url.starts_with("cosmetic://") {
                        url.strip_prefix("cosmetic://").unwrap_or(url).split('/').next().unwrap_or("cosmetic").to_string()
                    } else {
                        "shield-block".to_string()
                    }
                });

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            state.recent_blocked.push(BlockedItem {
                url: url.to_string(),
                domain,
                category: format!("{:?}", category).to_lowercase(),
                filter: "Brave adblock-rust".to_string(),
                timestamp: now,
            });

            if state.recent_blocked.len() > 100 {
                state.recent_blocked.remove(0);
            }
        }

        (tab_breakdown, category)
    }

    pub fn record_block(&self, tab_id: &str, url: &str, override_category: Option<ShieldCategory>) -> (TabBreakdown, ShieldCategory) {
        self.record_blocks(tab_id, url, override_category, 1)
    }

    pub fn get_stats(&self) -> ShieldStats {
        self.state.lock().map(|s| ShieldStats {
            enabled: s.settings.enabled,
            block_trackers: s.settings.block_trackers,
            upgrade_https: s.settings.upgrade_https,
            aggressive_sandbox: s.settings.aggressive_sandbox,
            total_blocked: s.total_blocked,
            total_breakdown: s.total_breakdown.clone(),
            tab_blocked: s.tab_blocked.clone(),
            tab_breakdown: s.tab_breakdown.clone(),
            recent_blocked: s.recent_blocked.clone(),
        }).unwrap_or_else(|_| ShieldStats {
            enabled: true,
            block_trackers: true,
            upgrade_https: true,
            aggressive_sandbox: false,
            total_blocked: 0,
            total_breakdown: TabBreakdown::default(),
            tab_blocked: HashMap::new(),
            tab_breakdown: HashMap::new(),
            recent_blocked: Vec::new(),
        })
    }

    pub fn get_tab_breakdown(&self, tab_id: &str) -> TabBreakdown {
        if let Ok(state) = self.state.lock() {
            let root_id = if let Some(base) = tab_id.strip_suffix("_left") {
                base
            } else if let Some(base) = tab_id.strip_suffix("_right") {
                base
            } else {
                tab_id
            };

            let left_id = format!("{}_left", root_id);
            let right_id = format!("{}_right", root_id);

            let main_stat = state.tab_breakdown.get(root_id).cloned().unwrap_or_default();
            let left_stat = state.tab_breakdown.get(&left_id).cloned().unwrap_or_default();
            let right_stat = state.tab_breakdown.get(&right_id).cloned().unwrap_or_default();

            TabBreakdown {
                total: main_stat.total + left_stat.total + right_stat.total,
                trackers: main_stat.trackers + left_stat.trackers + right_stat.trackers,
                ads: main_stat.ads + left_stat.ads + right_stat.ads,
                miners: main_stat.miners + left_stat.miners + right_stat.miners,
            }
        } else {
            TabBreakdown::default()
        }
    }

    pub fn get_tab_count(&self, tab_id: &str) -> u64 {
        self.get_tab_breakdown(tab_id).total
    }

    pub fn reset_tab(&self, tab_id: &str) -> (String, TabBreakdown) {
        if let Ok(mut state) = self.state.lock() {
            let root_id = if let Some(base) = tab_id.strip_suffix("_left") {
                state.tab_blocked.remove(tab_id);
                state.tab_breakdown.remove(tab_id);
                base.to_string()
            } else if let Some(base) = tab_id.strip_suffix("_right") {
                state.tab_blocked.remove(tab_id);
                state.tab_breakdown.remove(tab_id);
                base.to_string()
            } else {
                state.tab_blocked.remove(tab_id);
                state.tab_breakdown.remove(tab_id);
                let left_id = format!("{}_left", tab_id);
                let right_id = format!("{}_right", tab_id);
                state.tab_blocked.remove(&left_id);
                state.tab_breakdown.remove(&left_id);
                state.tab_blocked.remove(&right_id);
                state.tab_breakdown.remove(&right_id);
                tab_id.to_string()
            };

            let left_id = format!("{}_left", root_id);
            let right_id = format!("{}_right", root_id);
            let main_stat = state.tab_breakdown.get(&root_id).cloned().unwrap_or_default();
            let left_stat = state.tab_breakdown.get(&left_id).cloned().unwrap_or_default();
            let right_stat = state.tab_breakdown.get(&right_id).cloned().unwrap_or_default();

            let breakdown = TabBreakdown {
                total: main_stat.total + left_stat.total + right_stat.total,
                trackers: main_stat.trackers + left_stat.trackers + right_stat.trackers,
                ads: main_stat.ads + left_stat.ads + right_stat.ads,
                miners: main_stat.miners + left_stat.miners + right_stat.miners,
            };

            (root_id, breakdown)
        } else {
            (tab_id.to_string(), TabBreakdown::default())
        }
    }

    pub fn get_fast_domains_json(&self) -> &str {
        &self.fast_domains_json
    }

    pub fn get_youtube_scriptlet(&self) -> &str {
        &self.yt_scriptlet
    }

    pub fn get_youtube_hide_selectors(&self) -> &[String] {
        &self.yt_hide_selectors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yt_cosmetic_resources_present() {
        let mgr = ShieldManager::new();
        assert!(!mgr.get_youtube_hide_selectors().is_empty());
        assert!(!mgr.get_youtube_scriptlet().is_empty());
    }
}
