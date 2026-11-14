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
use serde::{Deserialize, Serialize};
use crate::core::config::{load_config, save_config, ShieldSettings};

const BRAVE_DATA_DIR: &str = "/home/yamada/CODE/BraveStuffs/adblock-rust/data/brave";
const EASYPRIVACY_PATH: &str = "/home/yamada/CODE/BraveStuffs/adblock-rust/data/easylist.to/easylist/easyprivacy.txt";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShieldCategory {
    Tracker,
    Ad,
    Miner,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TabBreakdown {
    pub total: u64,
    pub trackers: u64,
    pub ads: u64,
    pub miners: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldStats {
    pub enabled: bool,
    pub block_trackers: bool,
    pub upgrade_https: bool,
    pub aggressive_sandbox: bool,
    pub total_blocked: u64,
    pub total_breakdown: TabBreakdown,
    pub tab_blocked: HashMap<String, u64>,
    pub tab_breakdown: HashMap<String, TabBreakdown>,
    pub recent_blocked: Vec<BlockedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedItem {
    pub url: String,
    pub domain: String,
    pub category: String,
    pub filter: String,
    pub timestamp: u64,
}

pub struct ShieldState {
    pub settings: ShieldSettings,
    pub total_blocked: u64,
    pub total_breakdown: TabBreakdown,
    pub tab_blocked: HashMap<String, u64>,
    pub tab_breakdown: HashMap<String, TabBreakdown>,
    pub recent_blocked: Vec<BlockedItem>,
}

#[derive(Debug, Clone, Copy)]
pub struct SourceIndices {
    pub tracker_idx: u32,
    pub miner_idx: u32,
    pub ad_idx: u32,
}

pub struct ShieldManager {
    engine: Mutex<Engine>,
    state: Mutex<ShieldState>,
    sources: SourceIndices,
    fast_domains_json: String,
    yt_scriptlet: String,
    yt_hide_selectors: String,
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
        let yt_hide_selectors = yt_cosmetic.hide_selectors.into_iter().collect::<Vec<_>>().join(", ");

        eprintln!(
            "[YoonSpace Shield] adblock-rust ready: {} fast domains, {} bytes YouTube scriptlets, selectors: {}",
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
                            ShieldCategory::Ad
                        }
                    } else {
                        ShieldCategory::Ad
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

    pub fn reset_tab(&self, tab_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            let root_id = if let Some(base) = tab_id.strip_suffix("_left") {
                base
            } else if let Some(base) = tab_id.strip_suffix("_right") {
                base
            } else {
                tab_id
            };
            state.tab_blocked.remove(root_id);
            state.tab_breakdown.remove(root_id);
            let left_id = format!("{}_left", root_id);
            let right_id = format!("{}_right", root_id);
            state.tab_blocked.remove(&left_id);
            state.tab_breakdown.remove(&left_id);
            state.tab_blocked.remove(&right_id);
            state.tab_breakdown.remove(&right_id);
        }
    }

    pub fn get_fast_domains_json(&self) -> &str {
        &self.fast_domains_json
    }

    pub fn get_youtube_scriptlet(&self) -> &str {
        &self.yt_scriptlet
    }

    pub fn get_youtube_hide_selectors(&self) -> &str {
        &self.yt_hide_selectors
    }
}

/// Dynamically injects site-specific cosmetic CSS hide selectors for any page via adblock-rust
pub fn inject_page_cosmetics(webview: &tauri::Webview, tab_id: &str, url: &str) {
    let manager = get_shield_manager();
    if !manager.is_enabled() {
        return;
    }
    let cosmetic = manager.url_cosmetic_resources(url);
    if !cosmetic.hide_selectors.is_empty() {
        let selectors: Vec<String> = cosmetic.hide_selectors.into_iter().collect();
        let joined = selectors.join(", ");
        let escaped = joined.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ");
        let tab_id_escaped = tab_id.replace('\\', "\\\\").replace('"', "\\\"");
        let css_injection = format!(
            r#"(function() {{
                var s = document.getElementById("yoonspace-page-cosmetic");
                if (!s) {{
                    s = document.createElement("style");
                    s.id = "yoonspace-page-cosmetic";
                    (document.head || document.documentElement).appendChild(s);
                }}
                s.textContent = "{joined_escaped} {{ display: none !important; visibility: hidden !important; height: 0 !important; }}";
                try {{
                    var els = document.querySelectorAll("{joined_escaped}");
                    var count = els ? els.length : 0;
                    if (count > 0 && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shield_block) {{
                        window.webkit.messageHandlers.shield_block.postMessage(JSON.stringify({{
                            tabId: "{tab_id_escaped}",
                            url: "cosmetic://" + window.location.hostname + "/ad-elements",
                            category: "ad",
                            count: count
                        }}));
                    }}
                }} catch (e) {{}}
            }})();"#,
            joined_escaped = escaped,
            tab_id_escaped = tab_id_escaped
        );
        let _ = webview.eval(&css_injection);
    }
}

/// Generates the client-side JavaScript injected into every Webview at initialization.
/// Fully driven by Brave adblock-rust:
/// 1. Intercepts fetch and XMLHttpRequest against the Brave adblock engine
/// 2. Injects Brave's official scriptlets generated by adblock-rust for YouTube
/// 3. Injects cosmetic hide selectors generated by adblock-rust
/// 4. Upgrades connections to HTTPS when enabled
/// 5. Aggressive script sandboxing for canvas, audio, and popups when enabled
/// 6. Communicates via Tauri 2 IPC internals safely
pub fn get_shield_injection_script(tab_id: &str) -> String {
    let manager = get_shield_manager();
    let settings = manager.get_settings();
    let fast_domains_json = manager.get_fast_domains_json();
    let yt_scriptlet = manager.get_youtube_scriptlet();
    let yt_selectors = manager.get_youtube_hide_selectors();

    let template = r##"(function() {
  if (window.__YOONSPACE_SHIELD_INSTALLED__) return;
  window.__YOONSPACE_SHIELD_INSTALLED__ = true;
  window.__YOONSPACE_SHIELD_ENABLED__ = __INITIAL_ENABLED__;
  window.__YOONSPACE_SHIELD_TRACKERS__ = __INITIAL_TRACKERS__;
  window.__YOONSPACE_SHIELD_HTTPS__ = __INITIAL_HTTPS__;
  window.__YOONSPACE_SHIELD_SANDBOX__ = __INITIAL_SANDBOX__;

  const TAB_ID = "__TAB_ID__";

  const getInvoke = () => {
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
      return window.__TAURI_INTERNALS__.invoke;
    }
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === "function") {
      return window.__TAURI__.core.invoke;
    }
    return null;
  };

  // Fast O(1) set of domain rules with categories extracted directly from Brave adblock-rust filter lists
  const FAST_DOMAINS = __FAST_DOMAINS_MAP_JSON__;

  function checkFastMatch(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return null;
    try {
      const parsed = new URL(urlStr, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (FAST_DOMAINS[host]) return FAST_DOMAINS[host];
      let dotIdx = host.indexOf(".");
      while (dotIdx !== -1) {
        const sub = host.slice(dotIdx + 1);
        if (FAST_DOMAINS[sub]) return FAST_DOMAINS[sub];
        dotIdx = host.indexOf(".", dotIdx + 1);
      }
    } catch (e) {}
    return null;
  }

  function reportBlock(url, category, count) {
    try {
      const payload = JSON.stringify({
        tabId: TAB_ID,
        url: String(url),
        category: category || null,
        count: count || 1
      });
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.shield_block) {
        window.webkit.messageHandlers.shield_block.postMessage(payload);
        return;
      }
      const invoke = getInvoke();
      if (invoke) {
        invoke("record_shield_block", { tabId: TAB_ID, url: String(url), category: category || null });
      }
    } catch (e) {}
  }

  function upgradeHttps(url) {
    if (!window.__YOONSPACE_SHIELD_ENABLED__ || !window.__YOONSPACE_SHIELD_HTTPS__) return url;
    if (typeof url === "string" && url.startsWith("http://") && !url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) {
      return "https://" + url.slice(7);
    }
    return url;
  }

  // 1. Safe fetch() interception powered by Brave adblock-rust
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    let target = "";
    if (typeof resource === "string") {
      target = upgradeHttps(resource);
      resource = target;
    } else if (resource && typeof resource.url === "string") {
      target = upgradeHttps(resource.url);
    } else {
      target = String(resource || "");
    }

    // WebKitGTK data: URI compatibility
    if (target.startsWith("data:")) {
      try {
        const commaIdx = target.indexOf(",");
        if (commaIdx !== -1) {
          const meta = target.substring(5, commaIdx);
          const raw = target.substring(commaIdx + 1);
          const isBase64 = meta.indexOf(";base64") !== -1;
          const mime = meta.split(";")[0] || "application/octet-stream";
          let body;
          if (isBase64) {
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            body = bytes.buffer;
          } else {
            body = decodeURIComponent(raw);
          }
          return new Response(body, {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": mime }
          });
        }
      } catch (e) {}
    }

    if (window.__YOONSPACE_SHIELD_ENABLED__ && target && !target.startsWith("blob:")) {
      let matchedCategory = checkFastMatch(target);
      let isBlocked = !!matchedCategory;

      if (matchedCategory === "tracker" && !window.__YOONSPACE_SHIELD_TRACKERS__) {
        isBlocked = false;
      }

      // If not in fast set, verify against full Brave adblock-rust engine via Tauri IPC
      const invoke = getInvoke();
      if (!isBlocked && !matchedCategory && invoke) {
        try {
          isBlocked = await invoke("check_shield_url", {
            url: target,
            sourceUrl: window.location.href,
            reqType: "fetch"
          });
        } catch (e) {}
      }

      if (isBlocked) {
        reportBlock(target, matchedCategory || null);
        return new Response("{}", {
          status: 200,
          statusText: "OK",
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return originalFetch.apply(this, arguments);
  };

  // 2. Safe XMLHttpRequest interception
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    const upgraded = upgradeHttps(url);
    this._yoonspace_url = String(upgraded || "");
    if (window.__YOONSPACE_SHIELD_ENABLED__) {
      const matchedCat = checkFastMatch(this._yoonspace_url);
      if (matchedCat && (matchedCat !== "tracker" || window.__YOONSPACE_SHIELD_TRACKERS__)) {
        this._yoonspace_blocked = true;
        reportBlock(this._yoonspace_url, matchedCat);
      }
    }
    return originalOpen.apply(this, [method, upgraded, ...Array.prototype.slice.call(arguments, 2)]);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    if (this._yoonspace_blocked) {
      try {
        Object.defineProperty(this, "readyState", { value: 4, writable: false });
        Object.defineProperty(this, "status", { value: 200, writable: false });
        Object.defineProperty(this, "statusText", { value: "OK", writable: false });
        Object.defineProperty(this, "responseText", { value: "{}", writable: false });
        Object.defineProperty(this, "response", { value: "{}", writable: false });
      } catch (e) {}

      const self = this;
      setTimeout(function() {
        try {
          if (typeof self.onreadystatechange === "function") {
            self.onreadystatechange(new Event("readystatechange"));
          }
          if (typeof self.onload === "function") {
            self.onload(new Event("load"));
          }
          if (typeof self.onloadend === "function") {
            self.onloadend(new Event("loadend"));
          }
        } catch (e) {}
      }, 0);
      return;
    }

    return originalSend.apply(this, arguments);
  };

  // 3. Safe navigator.sendBeacon interception
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data) {
      if (window.__YOONSPACE_SHIELD_ENABLED__) {
        const target = String(url || "");
        const matchedCat = checkFastMatch(target);
        if (matchedCat && (matchedCat !== "tracker" || window.__YOONSPACE_SHIELD_TRACKERS__)) {
          reportBlock(target, matchedCat);
          return true;
        }
      }
      return origBeacon(url, data);
    };
  }

  // 4. Intercept dynamic script and iframe insertion
  const origCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const el = origCreateElement.apply(this, arguments);
    const tag = String(tagName).toLowerCase();
    if (tag === "script" || tag === "iframe") {
      const origSetAttr = el.setAttribute;
      el.setAttribute = function(name, value) {
        if (name.toLowerCase() === "src" && window.__YOONSPACE_SHIELD_ENABLED__) {
          const upgraded = upgradeHttps(value);
          const matchedCat = checkFastMatch(upgraded);
          if (matchedCat && (matchedCat !== "tracker" || window.__YOONSPACE_SHIELD_TRACKERS__)) {
            reportBlock(upgraded, matchedCat);
            return origSetAttr.call(this, "src", "about:blank");
          }
          return origSetAttr.call(this, name, upgraded);
        }
        return origSetAttr.apply(this, arguments);
      };

      Object.defineProperty(el, "src", {
        set(value) {
          if (window.__YOONSPACE_SHIELD_ENABLED__) {
            const upgraded = upgradeHttps(value);
            const matchedCat = checkFastMatch(upgraded);
            if (matchedCat && (matchedCat !== "tracker" || window.__YOONSPACE_SHIELD_TRACKERS__)) {
              reportBlock(upgraded, matchedCat);
              this.setAttribute("src", "about:blank");
              return;
            }
            this.setAttribute("src", upgraded);
            return;
          }
          this.setAttribute("src", value);
        },
        get() {
          return this.getAttribute("src") || "";
        },
        configurable: true
      });
    }
    return el;
  };

  // 5. Aggressive Script Sandboxing
  if (window.__YOONSPACE_SHIELD_SANDBOX__) {
    try {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        try {
          const ctx = this.getContext("2d");
          if (ctx) {
            const imgData = ctx.getImageData(0, 0, Math.min(8, this.width || 1), Math.min(8, this.height || 1));
            imgData.data[0] = (imgData.data[0] ^ 1);
            ctx.putImageData(imgData, 0, 0);
          }
        } catch(e) {}
        return origToDataURL.apply(this, arguments);
      };

      if (window.AudioBuffer) {
        const origGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function(channel) {
          const data = origGetChannelData.apply(this, arguments);
          if (data && data.length > 0) {
            data[0] = data[0] + 0.0000001;
          }
          return data;
        };
      }

      const origOpen = window.open;
      window.open = function(url, target, features) {
        if (url && (checkFastMatch(url) || !window.event || !window.event.isTrusted)) {
          reportBlock(url, "ad");
          return null;
        }
        return origOpen.apply(this, arguments);
      };
    } catch(e) {}
  }

  // 6. Inject cosmetic stylesheet generated by adblock-rust
  function injectCosmeticStyles() {
    if (!window.__YOONSPACE_SHIELD_ENABLED__) return;
    if (document.getElementById("yoonspace-shields-cosmetic")) return;

    const selectors = __YT_SELECTORS_JSON__;
    if (!selectors || selectors.trim() === "") return;

    const css = `${selectors} { display: none !important; visibility: hidden !important; height: 0 !important; }`;
    const style = document.createElement("style");
    style.id = "yoonspace-shields-cosmetic";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    try {
      const els = document.querySelectorAll(selectors);
      const count = els ? els.length : 0;
      if (count > 0) {
        reportBlock("cosmetic://" + window.location.hostname + "/yt-elements", "ad", count);
      }
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectCosmeticStyles);
  } else {
    injectCosmeticStyles();
  }

  // 7. Execute official Brave scriptlets generated by adblock-rust for YouTube
  if (window.__YOONSPACE_SHIELD_ENABLED__ && window.location.hostname.includes("youtube.com")) {
    try {
      __BRAVE_YT_SCRIPT__
    } catch (e) {
      console.warn("[YoonSpace Shield] Scriptlet warning:", e);
    }
  }

  // 8. Navigation keyboard shortcuts: Reload (Ctrl+R / F5), Back (Alt+Left / Cmd+[), Forward (Alt+Right / Cmd+])
  window.addEventListener("keydown", function(e) {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      window.location.reload();
    } else if ((e.altKey && (e.key === "ArrowLeft" || e.key === "Left")) || (e.metaKey && e.key === "[")) {
      e.preventDefault();
      window.history.back();
    } else if ((e.altKey && (e.key === "ArrowRight" || e.key === "Right")) || (e.metaKey && e.key === "]")) {
      e.preventDefault();
      window.history.forward();
    }
  }, true);
})();"##;

    let yt_selectors_json = serde_json::to_string(yt_selectors).unwrap_or_else(|_| "\"\"".to_string());

    template
        .replace("__TAB_ID__", tab_id)
        .replace("__INITIAL_ENABLED__", if settings.enabled { "true" } else { "false" })
        .replace("__INITIAL_TRACKERS__", if settings.block_trackers { "true" } else { "false" })
        .replace("__INITIAL_HTTPS__", if settings.upgrade_https { "true" } else { "false" })
        .replace("__INITIAL_SANDBOX__", if settings.aggressive_sandbox { "true" } else { "false" })
        .replace("__FAST_DOMAINS_MAP_JSON__", fast_domains_json)
        .replace("__BRAVE_YT_SCRIPT__", yt_scriptlet)
        .replace("__YT_SELECTORS_JSON__", &yt_selectors_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_shield_manager_from_cloned_brave() {
        let _guard = TEST_MUTEX.lock().unwrap();
        let manager = get_shield_manager();
        manager.set_enabled(true);
        manager.set_block_trackers(true);
        assert!(manager.is_enabled());

        // Check blocking of ad network URLs with adblock-rust native engine
        assert!(manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));
        assert!(manager.check_url("https://www.youtube.com/pagead/parallel_ad_playback", "https://www.youtube.com/watch?v=test", "xmlhttprequest"));
        assert!(manager.check_url("https://www.youtube.com/api/stats/ads?adformat=1", "https://www.youtube.com/watch?v=test", "other"));
        assert!(manager.check_url("https://www.youtube.com/youtubei/v1/player/ad_break", "https://www.youtube.com/watch?v=test", "fetch"));

        // YouTube video stream & metadata should NOT be blocked
        assert!(!manager.check_url("https://www.youtube.com/youtubei/v1/player?key=test", "https://www.youtube.com/watch?v=test", "fetch"));

        // Check non-ad URL passes through
        assert!(!manager.check_url("https://www.google.com/search?q=rust", "https://www.google.com", "document"));

        // Verify Brave scriptlets & cosmetic hide selectors exist for YouTube
        assert!(!manager.get_youtube_scriptlet().is_empty());
        assert!(!manager.get_youtube_hide_selectors().is_empty());

        // Verify category classifications directly via adblock-rust
        assert_eq!(manager.classify_url("https://coin-hive.com/lib/coinhive.min.js", "script"), ShieldCategory::Miner);
        assert_eq!(manager.classify_url("https://google-analytics.com/analytics.js", "script"), ShieldCategory::Tracker);
        assert_eq!(manager.classify_url("https://googleads.g.doubleclick.net/pagead/ads", "script"), ShieldCategory::Ad);
    }

    #[test]
    fn test_clean_shield_injection_script() {
        let script = get_shield_injection_script("test_tab");
        assert!(script.contains("window.__YOONSPACE_SHIELD_INSTALLED__"));
        assert!(script.contains("TAB_ID = \"test_tab\""));

        // Ensure no watchdog loop or hijack of playback controls exists
        assert!(!script.contains("runYouTubeWatchdog"));
        assert!(!script.contains("setInterval(runYouTubeWatchdog"));
        assert!(!script.contains("video.play()"));

        // Ensure Brave's scriptlets for YouTube are injected
        assert!(script.contains("ytInitialPlayerResponse") || script.contains("trustedReplaceXhrResponse") || script.contains("trustedReplaceFetchResponse"));

        // Ensure navigation keyboard shortcuts (Back, Forward, Reload) are present
        assert!(script.contains("window.history.back()"));
        assert!(script.contains("window.history.forward()"));
        assert!(script.contains("window.location.reload()"));
    }

    #[test]
    fn test_shield_breakdown_and_split_views() {
        let _guard = TEST_MUTEX.lock().unwrap();
        let manager = get_shield_manager();
        manager.reset_tab("test_split_tab");

        // Record blocks across main tab and split panes
        manager.record_block("test_split_tab_left", "https://googleads.g.doubleclick.net/pagead/ads", Some(ShieldCategory::Ad));
        manager.record_block("test_split_tab_left", "https://google-analytics.com/analytics.js", Some(ShieldCategory::Tracker));
        manager.record_block("test_split_tab_right", "https://coin-hive.com/lib/coinhive.min.js", Some(ShieldCategory::Miner));
        manager.record_block("test_split_tab", "https://facebook.net/tr?id=123", Some(ShieldCategory::Tracker));

        let breakdown = manager.get_tab_breakdown("test_split_tab");
        assert_eq!(breakdown.total, 4);
        assert_eq!(breakdown.ads, 1);
        assert_eq!(breakdown.trackers, 2);
        assert_eq!(breakdown.miners, 1);
        assert_eq!(manager.get_tab_count("test_split_tab"), 4);

        // Test batch cosmetic element counting
        let (batch_breakdown, _) = manager.record_blocks("test_split_tab_left", "cosmetic://example.com/ads", Some(ShieldCategory::Ad), 5);
        assert_eq!(batch_breakdown.ads, 6);
        assert_eq!(batch_breakdown.total, 9);
        assert_eq!(manager.get_tab_count("test_split_tab"), 9);

        manager.reset_tab("test_split_tab");
        assert_eq!(manager.get_tab_count("test_split_tab"), 0);
    }

    #[test]
    fn test_shield_toggles_and_trackers() {
        let _guard = TEST_MUTEX.lock().unwrap();
        let manager = get_shield_manager();

        // Master toggle behavior
        manager.set_enabled(false);
        assert!(!manager.is_enabled());
        assert!(!manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));
        manager.set_enabled(true);
        assert!(manager.is_enabled());
        assert!(manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));

        // Tracker toggle behavior
        manager.set_block_trackers(false);
        assert!(!manager.is_block_trackers());
        assert!(!manager.check_url("https://google-analytics.com/analytics.js", "https://example.com", "script"));

        manager.set_block_trackers(true);
        assert!(manager.is_block_trackers());
        assert!(manager.check_url("https://google-analytics.com/analytics.js", "https://example.com", "script"));

        // HTTPS toggle
        manager.set_upgrade_https(true);
        assert!(manager.is_upgrade_https());

        // Sandboxing toggle
        manager.set_aggressive_sandbox(true);
        assert!(manager.is_aggressive_sandbox());
        manager.set_aggressive_sandbox(false);
        assert!(!manager.is_aggressive_sandbox());
    }
}
