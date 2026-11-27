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

pub(super) fn get_media_observer_script(tab_id: &str) -> String {
    let tab_id_escaped = tab_id.replace('\\', "\\\\").replace('"', "\\\"");
    let target_vol = (crate::core::config::get_saved_media_volume() as f64 / 100.0).clamp(0.0, 1.0);
    format!(
        r##"(function() {{
  if (window.__YOONSPACE_MEDIA_OBSERVER__) return;
  window.__YOONSPACE_MEDIA_OBSERVER__ = true;
  const TAB_ID = "{tab_id}";
  if (typeof window.__YOONSPACE_TARGET_VOLUME__ !== "number") {{
    window.__YOONSPACE_TARGET_VOLUME__ = {target_vol:.4};
  }}
  let lastSnapshot = "";
  let lastTimeUpdateAt = 0;
  let lastDetachedMedia = null;
  const TIMEUPDATE_THROTTLE_MS = 300;
  const trackedDetachedMedia = new WeakSet();

  const origVolDesc = (() => {{
    try {{
      return Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
    }} catch (_) {{
      return null;
    }}
  }})();

  function getNativeVolume(m) {{
    try {{
      if (origVolDesc && typeof origVolDesc.get === "function") {{
        return origVolDesc.get.call(m);
      }}
      return m.volume;
    }} catch (_) {{
      return 1;
    }}
  }}

  function setNativeVolume(m, v) {{
    try {{
      window.__YOONSPACE_INTERNAL_VOL_CHANGE__ = true;
      if (origVolDesc && typeof origVolDesc.set === "function") {{
        origVolDesc.set.call(m, v);
      }} else {{
        m.volume = v;
      }}
    }} catch (_) {{}} finally {{
      window.__YOONSPACE_INTERNAL_VOL_CHANGE__ = false;
    }}
  }}

  function getTargetVolume() {{
    return typeof window.__YOONSPACE_TARGET_VOLUME__ === "number"
      ? Math.max(0, Math.min(1, window.__YOONSPACE_TARGET_VOLUME__))
      : 1;
  }}

  function applyRememberedVolume(m) {{
    if (!m) return;
    const targetVol = getTargetVolume();
    const curVol = getNativeVolume(m);
    if (!Number.isFinite(curVol) || Math.abs(curVol - targetVol) > 0.005) {{
      setNativeVolume(m, targetVol);
    }}
    if (targetVol === 0 && !m.muted) {{
      try {{ m.muted = true; }} catch (_) {{}}
    }}
  }}

  window.__YOONSPACE_SET_VOLUME__ = function(vol) {{
    const clamped = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 1));
    window.__YOONSPACE_TARGET_VOLUME__ = clamped;
    const targets = new Set(document.querySelectorAll("video, audio"));
    if (lastDetachedMedia && !lastDetachedMedia.isConnected) {{
      targets.add(lastDetachedMedia);
    }}
    targets.forEach((m) => {{
      setNativeVolume(m, clamped);
      try {{ m.muted = (clamped === 0); }} catch (_) {{}}
    }});
    reportState(true);
  }};

  // Prevent sites (e.g. YouTube's yt-player-volume restore) from overriding YoonSpace's remembered volume
  if (origVolDesc && origVolDesc.configurable && typeof origVolDesc.set === "function" && typeof origVolDesc.get === "function") {{
    try {{
      Object.defineProperty(HTMLMediaElement.prototype, "volume", {{
        configurable: true,
        enumerable: origVolDesc.enumerable,
        get: function() {{
          return origVolDesc.get.call(this);
        }},
        set: function(val) {{
          if (window.__YOONSPACE_INTERNAL_VOL_CHANGE__) {{
            return origVolDesc.set.call(this, val);
          }}
          const targetVol = getTargetVolume();
          return origVolDesc.set.call(this, targetVol);
        }}
      }});
    }} catch (_) {{}}
  }}

  function pickActiveMedia() {{
    const list = Array.from(document.querySelectorAll("video, audio"));
    if (lastDetachedMedia && !lastDetachedMedia.isConnected) {{
      list.push(lastDetachedMedia);
    }}
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
        const fallbackVol = typeof window.__YOONSPACE_TARGET_VOLUME__ === "number"
          ? Math.max(0, Math.min(1, window.__YOONSPACE_TARGET_VOLUME__))
          : 1;
        const emptyPayload = {{
          tabId: TAB_ID,
          hasMedia: false,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          volume: fallbackVol,
          muted: fallbackVol === 0,
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

  const events = ["play", "playing", "pause", "ended", "emptied", "loadedmetadata", "loadeddata", "canplay", "durationchange", "volumechange", "seeked", "timeupdate"];

  function handleMediaEvent(evt, target) {{
    if (evt === "timeupdate") {{
      const now = Date.now();
      if (now - lastTimeUpdateAt < TIMEUPDATE_THROTTLE_MS) return;
      lastTimeUpdateAt = now;
      reportState(false);
      return;
    }}

    lastTimeUpdateAt = 0;
    if (evt !== "pause" && evt !== "ended" && evt !== "emptied" && evt !== "seeked") {{
      if (target && (target.tagName === "VIDEO" || target.tagName === "AUDIO")) {{
        applyRememberedVolume(target);
      }} else {{
        document.querySelectorAll("video, audio").forEach(applyRememberedVolume);
      }}
    }}
    reportState(true);
  }}

  function trackDetachedMedia(m) {{
    if (!m || m.isConnected || trackedDetachedMedia.has(m)) return;
    trackedDetachedMedia.add(m);
    events.forEach((evt) => {{
      m.addEventListener(evt, () => {{
        if (m.isConnected) return;
        handleMediaEvent(evt, m);
      }});
    }});
  }}

  // Hook HTMLMediaElement.prototype.play so off-DOM players (e.g. new Audio()) are also tracked
  try {{
    const origPlay = HTMLMediaElement.prototype.play;
    if (typeof origPlay === "function") {{
      HTMLMediaElement.prototype.play = function() {{
        applyRememberedVolume(this);
        if (!this.isConnected) {{
          lastDetachedMedia = this;
          trackDetachedMedia(this);
        }}
        return origPlay.apply(this, arguments);
      }};
    }}
  }} catch (_) {{}}

  // Hook MediaSession.metadata setter so SPA title/artist updates reflect immediately
  try {{
    if (typeof MediaSession !== "undefined") {{
      const msDesc = Object.getOwnPropertyDescriptor(MediaSession.prototype, "metadata");
      if (msDesc && msDesc.configurable && typeof msDesc.set === "function" && typeof msDesc.get === "function") {{
        Object.defineProperty(MediaSession.prototype, "metadata", {{
          configurable: true,
          enumerable: msDesc.enumerable,
          get: function() {{
            return msDesc.get.call(this);
          }},
          set: function(val) {{
            const res = msDesc.set.call(this, val);
            queueMicrotask(() => reportState(true));
            return res;
          }}
        }});
      }}
    }}
  }} catch (_) {{}}

  events.forEach((evt) => {{
    document.addEventListener(evt, (e) => {{
      handleMediaEvent(evt, e && e.target);
    }}, true);
  }});

  window.addEventListener("yt-navigate-finish", () => setTimeout(() => {{
    document.querySelectorAll("video, audio").forEach(applyRememberedVolume);
    reportState(true);
  }}, 250));
  window.addEventListener("popstate", () => setTimeout(() => {{
    document.querySelectorAll("video, audio").forEach(applyRememberedVolume);
    reportState(true);
  }}, 250));
  if (document.readyState === "complete" || document.readyState === "interactive") {{
    document.querySelectorAll("video, audio").forEach(applyRememberedVolume);
    reportState(true);
  }} else {{
    window.addEventListener("DOMContentLoaded", () => {{
      document.querySelectorAll("video, audio").forEach(applyRememberedVolume);
      reportState(true);
    }});
  }}
}})();"##,
        tab_id = tab_id_escaped,
        target_vol = target_vol
    )
}

pub(super) fn get_favicon_observer_script(tab_id: &str) -> String {
    let tab_id_escaped = tab_id.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        r##"(function() {{
  if (window.__YOONSPACE_FAVICON_OBSERVER__) return;
  window.__YOONSPACE_FAVICON_OBSERVER__ = true;
  const TAB_ID = "{tab_id}";
  let lastReportedKey = "";

  function pickBestIconUrl() {{
    const links = Array.from(document.querySelectorAll('link[rel]'));
    let bestUrl = "";
    let bestScore = -1;
    for (const link of links) {{
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const href = link.href;
      if (!href) continue;
      const tokens = rel.split(/\s+/);
      const isIcon = tokens.includes('icon') || tokens.includes('apple-touch-icon') || tokens.includes('apple-touch-icon-precomposed') || rel === 'shortcut icon';
      if (!isIcon) continue;

      let score = 10;
      const lowerHref = href.toLowerCase();
      const type = (link.getAttribute('type') || '').toLowerCase();
      const sizes = (link.getAttribute('sizes') || '').toLowerCase();
      if (lowerHref.includes('.svg') || type.includes('svg')) score += 60;
      else if (lowerHref.includes('.png') || type.includes('png')) score += 40;
      if (rel.includes('apple-touch-icon')) score += 35;
      if (tokens.includes('icon')) score += 25;
      const sizeMatch = sizes.match(/(\d+)x\d+/);
      if (sizeMatch) score += Math.min(128, parseInt(sizeMatch[1], 10)) / 2;

      if (score > bestScore) {{
        bestScore = score;
        bestUrl = href;
      }}
    }}
    if (!bestUrl && location.origin && location.origin !== 'null') {{
      bestUrl = location.origin + '/favicon.ico';
    }}
    return bestUrl;
  }}

  function reportFavicon() {{
    try {{
      if (!location.href || !/^https?:\/\//i.test(location.href)) return;
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.site_favicon;
      if (!handler) return;
      const iconUrl = pickBestIconUrl();
      const key = location.origin + '|' + iconUrl;
      if (key === lastReportedKey) return;
      lastReportedKey = key;
      handler.postMessage(JSON.stringify({{
        tabId: TAB_ID,
        pageUrl: location.href,
        iconUrl: iconUrl || null,
        title: document.title || null
      }}));
    }} catch (e) {{}}
  }}

  if (document.readyState === 'complete' || document.readyState === 'interactive') {{
    setTimeout(reportFavicon, 120);
  }} else {{
    window.addEventListener('DOMContentLoaded', () => setTimeout(reportFavicon, 120), {{ once: true }});
  }}
  window.addEventListener('load', () => setTimeout(reportFavicon, 200));
  window.addEventListener('popstate', () => setTimeout(reportFavicon, 200));
  window.addEventListener('yt-navigate-finish', () => setTimeout(reportFavicon, 250));
}})();"##,
        tab_id = tab_id_escaped
    )
}
