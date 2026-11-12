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
// YoonSpace Shields adblocking engine is powered by Brave Software's
// open-source `adblock-rust` engine (Mozilla Public License 2.0).
// Reference repository: <https://github.com/brave/adblock-rust>
// Copyright (c) Brave Software Inc. All rights reserved.
// Filter syntax: EasyList, EasyPrivacy, and Brave Unbreak specifications.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use adblock::Engine;
use adblock::request::Request;
use serde::{Deserialize, Serialize};

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
    engine: Engine,
    state: Mutex<ShieldStats>,
}

static SHIELD_MANAGER: OnceLock<Arc<ShieldManager>> = OnceLock::new();

pub fn get_shield_manager() -> &'static Arc<ShieldManager> {
    SHIELD_MANAGER.get_or_init(|| {
        Arc::new(ShieldManager::new())
    })
}

impl ShieldManager {
    pub fn new() -> Self {
        // Curated ad, tracker, and telemetry rules following Brave Shields / EasyList syntax
        let default_rules = concat!(
            // Major ad networks & exchanges
            "||doubleclick.net^\n",
            "||googleadservices.com^\n",
            "||googlesyndication.com^\n",
            "||adservice.google.com^\n",
            "||pagead2.googlesyndication.com^\n",
            "||adnxs.com^\n",
            "||criteo.com^\n",
            "||criteo.net^\n",
            "||outbrain.com^\n",
            "||taboola.com^\n",
            "||amazon-adsystem.com^\n",
            "||rubiconproject.com^\n",
            "||pubmatic.com^\n",
            "||openx.net^\n",
            "||casalemedia.com^\n",
            "||adroll.com^\n",
            "||advertising.com^\n",
            "||popads.net^\n",
            "||propellerads.com^\n",
            "||adform.net^\n",
            "||moatads.com^\n",
            "||revcontent.com^\n",
            "||infolinks.com^\n",
            "||chitika.com^\n",
            "||exponential.com^\n",
            "||contextweb.com^\n",
            "||adtechus.com^\n",
            "||scorecardresearch.com^\n",
            "||quantserve.com^\n",

            // Trackers & Telemetry
            "||google-analytics.com^\n",
            "||analytics.google.com^\n",
            "||googletagmanager.com/gtm.js^\n",
            "||googletagservices.com^\n",
            "||hotjar.com^\n",
            "||clarity.ms^\n",
            "||connect.facebook.net/en_US/fbevents.js^\n",
            "||facebook.com/tr/^\n",
            "||chartbeat.com^\n",
            "||segment.io^\n",
            "||segment.com^\n",
            "||mixpanel.com^\n",
            "||amplitude.com^\n",
            "||newrelic.com^\n",
            "||yandex.ru/metrika^\n",
            "||mc.yandex.ru^\n",
            "||branch.io^\n",
            "||appsflyer.com^\n",
            "||adjust.com^\n",
            "||inspectlet.com^\n",
            "||mouseflow.com^\n",
            "||crazyegg.com^\n",

            // YouTube Ads (Brave brave-main-list.txt rules)
            "||youtube.com/api/stats/ads^\n",
            "||youtube.com/pagead/^\n",
            "||youtube.com/youtubei/v1/player/ad_break^\n",
            "||youtube.com/pcs/activeview^\n",
            "||youtube.com/ptracking^\n",
            "||s.youtube.com/api/stats/qoe?*&adformat=^\n",

            // Unbreak exemptions (Brave brave-unbreak.txt)
            "@@||youtube.com/yts/jsbin^\n",

            // Cosmetic element hiding rules (Safe subset from EasyList)
            "##.adsbygoogle\n",
            "##.ad-banner\n",
            "##.ad-container\n",
            "##.sponsored-post\n",
            "##.taboola-placeholder\n",
            "##.outbrain_widget\n",
            "##[id*=\"google_ads_iframe\"]\n",
            "##.ytd-display-ad-renderer\n",
            "##.ytd-in-feed-ad-layout-renderer\n",
            "##.ytd-banner-promo-renderer\n",
            "###player-ads\n",
            "##.ytp-ad-overlay-container\n"
        );

        let engine = Engine::new_with_list_text(default_rules);
        eprintln!("[YoonSpace Shield] Brave adblock-rust engine initialized successfully.");

        Self {
            engine,
            state: Mutex::new(ShieldStats {
                enabled: true,
                total_blocked: 0,
                tab_blocked: HashMap::new(),
                recent_blocked: Vec::new(),
            }),
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

    pub fn check_url(&self, url: &str, source_url: &str) -> bool {
        if !self.is_enabled() {
            return false;
        }

        if let Ok(req) = Request::new(url, source_url, "other", "GET") {
            let res = self.engine.check_network_request(&req);
            res.filter.is_some() && res.exception.is_none()
        } else {
            false
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
                filter: "Brave Shields EasyList".to_string(),
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
}

/// Generates the client-side JavaScript injected into every Webview at initialization.
/// Provides:
/// 1. Safe fetch & XHR proxies returning compliant mock responses (following Brave redirect conventions)
/// 2. WebKitGTK data-URI handling for seamless application state loading
/// 3. Non-destructive cosmetic element hiding (Brave EasyList)
/// 4. Brave-style YouTube video ad auto-skip & fast-forward without hiding or breaking the video player
pub fn get_shield_injection_script(tab_id: &str) -> String {
    let initial_enabled = get_shield_manager().is_enabled();
    let template = r##"(function() {
  if (window.__YOONSPACE_SHIELD_INSTALLED__) return;
  window.__YOONSPACE_SHIELD_INSTALLED__ = true;
  window.__YOONSPACE_SHIELD_ENABLED__ = __INITIAL_ENABLED__;

  const TAB_ID = "__TAB_ID__";

  // Known top ad & tracker domains for instant in-page interception (Brave Shields EasyList reference)
  const BLOCKED_DOMAINS = [
    "doubleclick.net", "googleadservices.com", "googlesyndication.com",
    "adservice.google.com", "adnxs.com", "criteo.com", "criteo.net",
    "outbrain.com", "taboola.com", "amazon-adsystem.com", "rubiconproject.com",
    "pubmatic.com", "openx.net", "casalemedia.com", "adroll.com",
    "popads.net", "propellerads.com", "adform.net", "moatads.com",
    "google-analytics.com", "hotjar.com", "clarity.ms", "scorecardresearch.com",
    "quantserve.com", "branch.io", "appsflyer.com", "adjust.com"
  ];

  function isBlockedUrl(rawUrl) {
    if (!window.__YOONSPACE_SHIELD_ENABLED__) return false;
    if (!rawUrl || typeof rawUrl !== "string") return false;
    try {
      const parsed = new URL(rawUrl, window.location.href);
      const host = parsed.hostname.toLowerCase();
      for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
        if (host === BLOCKED_DOMAINS[i] || host.endsWith("." + BLOCKED_DOMAINS[i])) {
          return true;
        }
      }
      if (host.includes("youtube.com") && (parsed.pathname.includes("/pagead/") || parsed.pathname.includes("/api/stats/ads"))) {
        return true;
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

  // 1. Intercept fetch() safely
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    let target = "";
    if (typeof resource === "string") {
      target = resource;
    } else if (resource && typeof resource.url === "string") {
      target = resource.url;
    } else {
      target = String(resource || "");
    }

    // WebKitGTK fix: handle data: URI fetch cleanly if WebKit blocks it under access control
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
          return Promise.resolve(new Response(body, {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": mime }
          }));
        }
      } catch (e) {}
    }

    if (isBlockedUrl(target)) {
      reportBlock(target);
      // Return a valid mock JSON response (Brave redirect convention) so .json() and .text() calls succeed
      return Promise.resolve(new Response("{}", {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" }
      }));
    }
    return originalFetch.apply(this, arguments);
  };

  // 2. Intercept XMLHttpRequest safely without abort() crashing caller pipelines
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isBlockedUrl(url)) {
      this._yoonspace_blocked = true;
      reportBlock(url);
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

  // 3. Non-destructive cosmetic element hiding stylesheet (Brave EasyList)
  function injectCosmeticStyles() {
    if (!window.__YOONSPACE_SHIELD_ENABLED__) return;
    if (document.getElementById("yoonspace-shields-cosmetic")) return;
    const css = `
      .adsbygoogle, .ad-banner, .ad-container, .sponsored-post,
      .taboola-placeholder, .outbrain_widget, [id*="google_ads_iframe"],
      .ytd-display-ad-renderer, .ytd-in-feed-ad-layout-renderer, .ytd-banner-promo-renderer,
      #player-ads, .ytp-ad-overlay-container {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `;
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

  // 4. Brave-style YouTube Ad Skipper (safe non-blocking implementation)
  if (window.location.hostname.includes("youtube.com")) {
    setInterval(function() {
      if (!window.__YOONSPACE_SHIELD_ENABLED__) return;
      const skipBtn = document.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button.ytp-ad-skip-button-text");
      if (skipBtn) {
        skipBtn.click();
        reportBlock("youtube-ad-skipped");
        return;
      }
      const player = document.querySelector("#movie_player, .html5-video-player");
      const video = document.querySelector("video");
      if (player && video && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) {
        if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration) {
          video.currentTime = video.duration - 0.1;
          video.playbackRate = 16.0;
        }
      }
    }, 250);
  }
})();"##;

    template
        .replace("__TAB_ID__", tab_id)
        .replace("__INITIAL_ENABLED__", if initial_enabled { "true" } else { "false" })
}
