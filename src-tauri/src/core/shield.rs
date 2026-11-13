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

const BRAVE_DATA_DIR: &str = "/home/yamada/CODE/BraveStuffs/adblock-rust/data/brave";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldStats {
    pub enabled: bool,
    pub total_blocked: u64,
    pub tab_blocked: HashMap<String, u64>,
    pub recent_blocked: Vec<BlockedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedItem {
    pub url: String,
    pub domain: String,
    pub filter: String,
    pub timestamp: u64,
}

pub struct ShieldManager {
    engine: Mutex<Engine>,
    state: Mutex<ShieldStats>,
    fast_blocked_domains_json: String,
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

impl ShieldManager {
    pub fn new() -> Self {
        eprintln!("[YoonSpace Shield] Loading Brave adblock-rust from: {}", BRAVE_DATA_DIR);

        let data_dir = Path::new(BRAVE_DATA_DIR);
        let list_path = data_dir.join("brave-main-list.txt");
        let unbreak_path = data_dir.join("brave-unbreak.txt");
        let res_path = data_dir.join("brave-resources.json");

        // 1. Load resources directly from Brave adblock-rust
        let res_str = fs::read_to_string(&res_path)
            .unwrap_or_else(|e| panic!("Failed to read Brave resources at {:?}: {}", res_path, e));
        let resources: Vec<Resource> = serde_json::from_str(&res_str)
            .unwrap_or_else(|e| panic!("Failed to parse Brave resources JSON: {}", e));

        // 2. Check engine cache to boot in ~10ms
        let cache_dir = get_cache_dir();
        let engine_cache_file = cache_dir.join("shield_engine.dat");
        let meta_cache_file = cache_dir.join("shield_engine.meta");

        let list_meta = fs::metadata(&list_path)
            .unwrap_or_else(|e| panic!("Failed to access {:?}: {}", list_path, e));
        let list_size = list_meta.len();

        let mut engine_opt: Option<Engine> = None;
        if engine_cache_file.exists() && meta_cache_file.exists() {
            if let Ok(meta_str) = fs::read_to_string(&meta_cache_file) {
                if meta_str.trim() == list_size.to_string() {
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

        // 3. If cache miss, parse lists with adblock-rust FilterSet
        let list_str = fs::read_to_string(&list_path)
            .unwrap_or_else(|e| panic!("Failed to read {:?}: {}", list_path, e));

        let engine = match engine_opt {
            Some(e) => e,
            None => {
                let mut filter_set = FilterSet::new(false);
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
                let _ = fs::write(&meta_cache_file, list_size.to_string());
                eprintln!("[YoonSpace Shield] Compiled Brave adblock filter list ({} bytes) and cached engine.", serialized.len());
                built
            }
        };

        // 4. Extract top blocked domains directly from brave-main-list.txt for O(1) in-page synchronous matching
        let mut fast_domains: Vec<String> = Vec::with_capacity(3000);
        for line in list_str.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("||") && trimmed.ends_with('^') && !trimmed.contains('/') && !trimmed.contains('*') && !trimmed.contains('$') && !trimmed.contains(':') {
                let domain = &trimmed[2..trimmed.len() - 1];
                if !domain.is_empty() {
                    fast_domains.push(domain.to_lowercase());
                    if fast_domains.len() >= 3000 {
                        break;
                    }
                }
            }
        }
        let fast_blocked_domains_json = serde_json::to_string(&fast_domains).unwrap_or_else(|_| "[]".to_string());

        // 5. Query official Brave cosmetic resources and scriptlets for YouTube from adblock-rust
        let yt_cosmetic = engine.url_cosmetic_resources("https://www.youtube.com/watch?v=test");
        let yt_scriptlet = yt_cosmetic.injected_script;
        let yt_hide_selectors = yt_cosmetic.hide_selectors.into_iter().collect::<Vec<_>>().join(", ");

        eprintln!(
            "[YoonSpace Shield] adblock-rust ready: {} fast domains, {} bytes YouTube scriptlets, selectors: {}",
            fast_domains.len(),
            yt_scriptlet.len(),
            yt_hide_selectors.len()
        );

        Self {
            engine: Mutex::new(engine),
            state: Mutex::new(ShieldStats {
                enabled: true,
                total_blocked: 0,
                tab_blocked: HashMap::new(),
                recent_blocked: Vec::new(),
            }),
            fast_blocked_domains_json,
            yt_scriptlet,
            yt_hide_selectors,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.state.lock().map(|s| s.enabled).unwrap_or(true)
    }

    pub fn set_enabled(&self, enabled: bool) {
        if let Ok(mut state) = self.state.lock() {
            state.enabled = enabled;
        }
    }

    /// Check if a network request should be blocked according to the full 196,000+ rule Brave engine.
    pub fn check_url(&self, url: &str, source_url: &str, req_type: &str) -> bool {
        if !self.is_enabled() {
            return false;
        }

        if let Ok(req) = Request::new(url, source_url, req_type, "GET") {
            if let Ok(engine) = self.engine.lock() {
                return engine.check_network_request(&req).should_block();
            }
        }
        false
    }

    /// Query adblock-rust for cosmetic CSS hide selectors and scriptlets for any given URL.
    pub fn url_cosmetic_resources(&self, url: &str) -> UrlSpecificResources {
        if let Ok(engine) = self.engine.lock() {
            engine.url_cosmetic_resources(url)
        } else {
            UrlSpecificResources::empty()
        }
    }

    pub fn record_block(&self, tab_id: &str, url: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.total_blocked += 1;
            *state.tab_blocked.entry(tab_id.to_string()).or_insert(0) += 1;

            let domain = url::Url::parse(url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| "tracker".to_string());

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            state.recent_blocked.push(BlockedItem {
                url: url.to_string(),
                domain,
                filter: "Brave adblock-rust".to_string(),
                timestamp: now,
            });

            if state.recent_blocked.len() > 100 {
                state.recent_blocked.remove(0);
            }
        }
    }

    pub fn get_stats(&self) -> ShieldStats {
        self.state.lock().map(|s| s.clone()).unwrap_or_else(|_| ShieldStats {
            enabled: true,
            total_blocked: 0,
            tab_blocked: HashMap::new(),
            recent_blocked: Vec::new(),
        })
    }

    pub fn get_tab_count(&self, tab_id: &str) -> u64 {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.tab_blocked.get(tab_id).copied())
            .unwrap_or(0)
    }

    pub fn reset_tab(&self, tab_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.tab_blocked.remove(tab_id);
        }
    }

    pub fn get_fast_domains_json(&self) -> &str {
        &self.fast_blocked_domains_json
    }

    pub fn get_youtube_scriptlet(&self) -> &str {
        &self.yt_scriptlet
    }

    pub fn get_youtube_hide_selectors(&self) -> &str {
        &self.yt_hide_selectors
    }
}

/// Dynamically injects site-specific cosmetic CSS hide selectors for any page via adblock-rust
pub fn inject_page_cosmetics(webview: &tauri::Webview, url: &str) {
    let manager = get_shield_manager();
    if !manager.is_enabled() {
        return;
    }
    let cosmetic = manager.url_cosmetic_resources(url);
    if !cosmetic.hide_selectors.is_empty() {
        let selectors: Vec<String> = cosmetic.hide_selectors.into_iter().collect();
        let joined = selectors.join(", ");
        let escaped = joined.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ");
        let css_injection = format!(
            r#"(function() {{
                var s = document.getElementById("yoonspace-page-cosmetic");
                if (!s) {{
                    s = document.createElement("style");
                    s.id = "yoonspace-page-cosmetic";
                    (document.head || document.documentElement).appendChild(s);
                }}
                s.textContent = "{} {{ display: none !important; visibility: hidden !important; height: 0 !important; }}";
            }})();"#,
            escaped
        );
        let _ = webview.eval(&css_injection);
    }
}

/// Generates the client-side JavaScript injected into every Webview at initialization.
/// Fully driven by Brave adblock-rust:
/// 1. Intercepts fetch and XMLHttpRequest against the Brave adblock engine
/// 2. Injects Brave's official scriptlets generated by adblock-rust for YouTube
/// 3. Injects cosmetic hide selectors generated by adblock-rust
/// 4. Does NOT hijack user media controls (preserves full video play/pause controls)
pub fn get_shield_injection_script(tab_id: &str) -> String {
    let manager = get_shield_manager();
    let initial_enabled = manager.is_enabled();
    let fast_domains_json = manager.get_fast_domains_json();
    let yt_scriptlet = manager.get_youtube_scriptlet();
    let yt_selectors = manager.get_youtube_hide_selectors();

    let template = r##"(function() {
  if (window.__YOONSPACE_SHIELD_INSTALLED__) return;
  window.__YOONSPACE_SHIELD_INSTALLED__ = true;
  window.__YOONSPACE_SHIELD_ENABLED__ = __INITIAL_ENABLED__;

  const TAB_ID = "__TAB_ID__";

  // Fast O(1) set of domain rules extracted directly from Brave adblock-rust
  const FAST_DOMAINS = new Set(__FAST_DOMAINS_JSON__);

  function checkFastMatch(urlStr) {
    if (!urlStr || typeof urlStr !== "string") return false;
    try {
      const parsed = new URL(urlStr, window.location.href);
      const host = parsed.hostname.toLowerCase();
      if (FAST_DOMAINS.has(host)) return true;
      // Check subdomains
      let dotIdx = host.indexOf(".");
      while (dotIdx !== -1) {
        const sub = host.slice(dotIdx + 1);
        if (FAST_DOMAINS.has(sub)) return true;
        dotIdx = host.indexOf(".", dotIdx + 1);
      }
    } catch (e) {}
    return false;
  }

  function reportBlock(url) {
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke("record_shield_block", { tabId: TAB_ID, url: String(url) });
      }
    } catch (e) {}
  }

  // 1. Safe fetch() interception powered by Brave adblock-rust
  const originalFetch = window.fetch;
  window.fetch = async function(resource, init) {
    let target = "";
    if (typeof resource === "string") {
      target = resource;
    } else if (resource && typeof resource.url === "string") {
      target = resource.url;
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
      let isBlocked = checkFastMatch(target);

      // If not in fast set, verify against full 196k rule adblock-rust engine via Tauri IPC
      if (!isBlocked && window.__TAURI__ && window.__TAURI__.core) {
        try {
          isBlocked = await window.__TAURI__.core.invoke("check_shield_url", {
            url: target,
            sourceUrl: window.location.href,
            reqType: "fetch"
          });
        } catch (e) {}
      }

      if (isBlocked) {
        reportBlock(target);
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
    this._yoonspace_url = String(url || "");
    if (window.__YOONSPACE_SHIELD_ENABLED__ && checkFastMatch(this._yoonspace_url)) {
      this._yoonspace_blocked = true;
      reportBlock(this._yoonspace_url);
    }
    return originalOpen.apply(this, arguments);
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

  // 3. Inject cosmetic stylesheet generated by adblock-rust
  function injectCosmeticStyles() {
    if (!window.__YOONSPACE_SHIELD_ENABLED__) return;
    if (document.getElementById("yoonspace-shields-cosmetic")) return;

    const selectors = `__YT_SELECTORS__`;
    if (!selectors || selectors.trim() === "") return;

    const css = `${selectors} { display: none !important; visibility: hidden !important; height: 0 !important; }`;
    const style = document.createElement("style");
    style.id = "yoonspace-shields-cosmetic";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectCosmeticStyles);
  } else {
    injectCosmeticStyles();
  }

  // 4. Execute official Brave scriptlets generated by adblock-rust for YouTube
  if (window.location.hostname.includes("youtube.com")) {
    try {
      __BRAVE_YT_SCRIPT__
    } catch (e) {
      console.warn("[YoonSpace Shield] Scriptlet warning:", e);
    }
  }
})();"##;

    template
        .replace("__TAB_ID__", tab_id)
        .replace("__INITIAL_ENABLED__", if initial_enabled { "true" } else { "false" })
        .replace("__FAST_DOMAINS_JSON__", fast_domains_json)
        .replace("__BRAVE_YT_SCRIPT__", yt_scriptlet)
        .replace("__YT_SELECTORS__", yt_selectors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shield_manager_from_cloned_brave() {
        let manager = get_shield_manager();
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
    }
}
