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

import { tauriIpc } from "../services/tauri_ipc";
import type { MinimizedTab } from "../types";

export interface WebviewMediaState {
  tabId?: string;
  hasMedia: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  title: string;
  artist: string;
}

export interface MediaController {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  setLeftOffset: (offset: number) => void;
  updateActiveTab: (tab: MinimizedTab | null) => void;
  updateMediaState: (state: WebviewMediaState) => void;
  destroy: () => void;
}

interface QuickApp {
  name: string;
  url: string;
  icon: string;
  color: string;
  desc: string;
  custom?: boolean;
}

const CUSTOM_APPS_STORAGE_KEY = "yoonspace_custom_quick_apps";

const DEFAULT_QUICK_APPS: QuickApp[] = [
  {
    name: "YouTube",
    url: "https://www.youtube.com",
    icon: "smart_display",
    color: "#ff0000",
    desc: "Watch videos, music & live streams",
  },
];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadCustomApps(): QuickApp[] {
  try {
    const raw = localStorage.getItem(CUSTOM_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QuickApp =>
        Boolean(item && typeof item.name === "string" && typeof item.url === "string")
    );
  } catch {
    return [];
  }
}

function saveCustomApps(apps: QuickApp[]): void {
  try {
    localStorage.setItem(CUSTOM_APPS_STORAGE_KEY, JSON.stringify(apps));
  } catch {}
}

export function createMediaController(
  onClose?: () => void,
  onOpenUrl?: (url: string, title?: string) => void,
  onActivateTab?: (tabId: string) => void,
  onMediaStateChange?: (isPlaying: boolean) => void
): MediaController {
  const sidebar = document.createElement("aside");
  sidebar.id = "yoonspace-media-sidebar";
  sidebar.className =
    "hidden fixed top-[80px] bottom-0 z-40 w-[360px] flex flex-col border-r border-[#2e2e30] bg-[#161618] text-[#e5e2e1] shadow-2xl select-none overflow-hidden transition-[left] duration-200 ease-out";
  sidebar.style.left = "64px";

  let isDrawerVisible = false;
  let activeTabReference: MinimizedTab | null = null;
  let activeSection: "now-playing" | "apps" = "now-playing";
  let customApps: QuickApp[] = loadCustomApps();

  // Tab media playback state
  let isTabMediaPlaying = false;
  let isTabMediaMuted = false;
  let tabMediaVolume = 1.0;
  let tabMediaSeek = 0;
  let tabMediaDuration = 0;
  let isSeeking = false;
  let isAdjustingVolume = false;

  function formatTime(totalSeconds: number): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
    const s = Math.floor(totalSeconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  sidebar.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2e2e30] bg-[#1a1a1c]">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-[#28282b] flex items-center justify-center text-[#f85e2a]">
          <span id="media-header-icon" class="material-symbols-outlined text-[18px]">music_note</span>
        </div>
        <div>
          <h2 class="text-sm font-semibold text-white tracking-tight">Music &amp; Media</h2>
          <p id="media-header-sub" class="text-[11px] text-neutral-400 font-mono mt-0.5 truncate max-w-[200px]">Tab control &amp; playback</p>
        </div>
      </div>

      <button
        type="button"
        id="btn-close-media"
        aria-label="Close Media Control"
        title="Close Media Control"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex items-center px-3 pt-2.5 pb-2 border-b border-[#28282a] bg-[#141416] gap-1.5 shrink-0">
      <button
        type="button"
        id="tab-btn-now-playing"
        class="media-nav-tab flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer bg-[#242428] text-white shadow-sm flex items-center justify-center gap-1.5"
      >
        <span class="material-symbols-outlined text-[15px]">play_circle</span>
        <span>Now Playing</span>
      </button>

      <button
        type="button"
        id="tab-btn-apps"
        class="media-nav-tab flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer text-neutral-400 hover:text-white hover:bg-[#202022] flex items-center justify-center gap-1.5"
      >
        <span class="material-symbols-outlined text-[15px]">apps</span>
        <span>Quick Apps</span>
      </button>
    </div>

    <!-- Scrollable Content Body -->
    <div id="media-content-scroll" class="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar" style="scrollbar-width: thin;">
      <!-- 1. NOW PLAYING SECTION -->
      <section id="section-now-playing" class="space-y-4">
        <!-- Media Visual Card -->
        <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#241f1e] via-[#1c1c1f] to-[#161618] border border-[#332f2e] p-4 shadow-lg">
          <!-- Ambient Glow Background -->
          <div class="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-[#f85e2a]/10 blur-2xl pointer-events-none"></div>

          <!-- Top Row: Domain / Source Badge & Jump Button -->
          <div class="flex items-center justify-between mb-3 relative z-10">
            <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#141416]/90 border border-[#38383c] text-[11px] font-mono text-[#ffb59e]">
              <span id="now-playing-icon" class="material-symbols-outlined text-[14px] text-[#f85e2a]">web</span>
              <span id="now-playing-domain" class="truncate max-w-[170px]">Browser Media</span>
            </div>

            <button
              type="button"
              id="btn-media-jump-tab"
              title="Jump to active tab"
              class="w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-white hover:bg-[#2e2e34] transition-colors cursor-pointer"
            >
              <span class="material-symbols-outlined text-[15px]">open_in_new</span>
            </button>
          </div>

          <!-- Artwork / Equalizer Banner -->
          <div class="flex items-center gap-3.5 mb-3.5 relative z-10">
            <div id="now-playing-artwork" class="w-14 h-14 rounded-xl bg-[#2b2b30] border border-[#3f3f46] flex items-center justify-center text-[#f85e2a] shadow-inner shrink-0 relative overflow-hidden">
              <span class="material-symbols-outlined text-[28px]">graphic_eq</span>
              <div id="visualizer-bars" class="hidden absolute inset-0 bg-[#000000]/40 flex items-end justify-center gap-1 px-2 pb-2">
                <span class="w-1 bg-[#f85e2a] rounded-t animate-pulse h-5"></span>
                <span class="w-1 bg-[#ffb59e] rounded-t animate-pulse h-8 delay-75"></span>
                <span class="w-1 bg-[#f85e2a] rounded-t animate-pulse h-4 delay-150"></span>
                <span class="w-1 bg-[#ff7e4f] rounded-t animate-pulse h-7 delay-100"></span>
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <h3 id="now-playing-title" class="text-sm font-semibold text-white tracking-tight truncate leading-tight">
                No active tab media
              </h3>
              <p id="now-playing-sub" class="text-xs text-neutral-400 truncate mt-1">
                Open YouTube, Spotify, or any media site
              </p>
            </div>
          </div>

          <!-- Timeline Slider -->
          <div class="space-y-1.5 relative z-10">
            <div class="relative w-full flex items-center">
              <input
                type="range"
                id="media-seek-slider"
                min="0"
                max="100"
                value="0"
                class="w-full h-1.5 bg-[#333338] rounded-lg appearance-none cursor-pointer accent-[#f85e2a]"
              />
            </div>
            <div class="flex items-center justify-between text-[10px] font-mono text-neutral-400">
              <span id="media-time-current">0:00</span>
              <span id="media-time-total">--:--</span>
            </div>
          </div>

          <!-- Playback Controls -->
          <div class="flex items-center justify-center gap-3 mt-3.5 pt-2 border-t border-[#2e2e34]/70 relative z-10">
            <!-- Prev Button -->
            <button
              type="button"
              id="btn-media-prev"
              title="Previous Track (Seek -10s)"
              class="w-9 h-9 rounded-xl flex items-center justify-center text-[#e5e2e1] hover:text-white hover:bg-[#2f2f35] active:scale-95 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[20px]">skip_previous</span>
            </button>

            <!-- Play / Pause Main Button -->
            <button
              type="button"
              id="btn-media-play-pause"
              title="Play / Pause"
              class="w-12 h-12 rounded-full bg-[#f85e2a] hover:bg-[#ff7240] text-black shadow-lg shadow-[#f85e2a]/30 flex items-center justify-center active:scale-95 transition-all cursor-pointer font-bold"
            >
              <span id="media-play-icon" class="material-symbols-outlined text-[28px]">play_arrow</span>
            </button>

            <!-- Next Button -->
            <button
              type="button"
              id="btn-media-next"
              title="Next Track (Seek +10s)"
              class="w-9 h-9 rounded-xl flex items-center justify-center text-[#e5e2e1] hover:text-white hover:bg-[#2f2f35] active:scale-95 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[20px]">skip_next</span>
            </button>
          </div>
        </div>

        <!-- Volume & Quick Actions Bar -->
        <div class="rounded-xl bg-[#1b1b1e] border border-[#2b2b2e] p-3 space-y-2.5">
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              id="btn-media-mute"
              title="Mute / Unmute"
              class="text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <span id="media-volume-icon" class="material-symbols-outlined text-[19px]">volume_up</span>
            </button>
            <input
              type="range"
              id="media-volume-slider"
              min="0"
              max="100"
              value="100"
              class="flex-1 h-1.5 bg-[#333338] rounded-lg appearance-none cursor-pointer accent-[#f85e2a]"
            />
            <span id="media-volume-label" class="text-[11px] font-mono text-neutral-400 w-8 text-right">100%</span>
          </div>

          <div class="pt-1 border-t border-[#26262a]">
            <button
              type="button"
              id="btn-media-pip"
              class="w-full py-1.5 px-2.5 rounded-lg bg-[#242428] hover:bg-[#2d2d32] text-neutral-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px] text-[#ffb59e]">picture_in_picture_alt</span>
              <span>Pop-out PiP</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 2. QUICK STREAMING APPS SECTION -->
      <section id="section-apps" class="space-y-3 hidden">
        <div class="flex items-center justify-between px-1">
          <label class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Launch Apps</label>
          <button
            type="button"
            id="btn-add-quick-app"
            title="Add custom app"
            class="w-6 h-6 rounded-md bg-[#242428] hover:bg-[#f85e2a] hover:text-black text-neutral-300 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          >
            <span class="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        <!-- Add Custom App Inline Form -->
        <form id="add-quick-app-form" class="hidden p-3 rounded-xl bg-[#1a1a1d] border border-[#2c2c30] space-y-2.5">
          <div class="space-y-1.5">
            <input
              type="text"
              id="quick-app-name-input"
              placeholder="App name (e.g. Spotify)"
              required
              class="w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white placeholder-neutral-500"
            />
            <input
              type="text"
              id="quick-app-url-input"
              placeholder="URL (e.g. open.spotify.com)"
              required
              class="w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white placeholder-neutral-500"
            />
          </div>
          <div class="flex items-center justify-end gap-2">
            <button
              type="button"
              id="btn-cancel-quick-app"
              class="px-2.5 py-1 rounded-lg bg-[#242428] hover:bg-[#2d2d32] text-xs text-neutral-300 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-3 py-1 rounded-lg bg-[#f85e2a] hover:bg-[#ff7240] text-black text-xs font-semibold cursor-pointer transition-colors"
            >
              Add
            </button>
          </div>
        </form>

        <div class="grid grid-cols-1 gap-2.5" id="streaming-apps-list">
          <!-- Dynamically populated -->
        </div>
      </section>
    </div>
  `;

  if (document.body) {
    document.body.appendChild(sidebar);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(sidebar);
    });
  }

  // Element selectors
  const btnClose = sidebar.querySelector("#btn-close-media") as HTMLButtonElement;
  const headerIcon = sidebar.querySelector("#media-header-icon") as HTMLElement;
  const headerSub = sidebar.querySelector("#media-header-sub") as HTMLElement;

  // Nav buttons
  const tabBtnNowPlaying = sidebar.querySelector("#tab-btn-now-playing") as HTMLButtonElement;
  const tabBtnApps = sidebar.querySelector("#tab-btn-apps") as HTMLButtonElement;

  // Sections
  const secNowPlaying = sidebar.querySelector("#section-now-playing") as HTMLElement;
  const secApps = sidebar.querySelector("#section-apps") as HTMLElement;

  // Now Playing Controls
  const npTitle = sidebar.querySelector("#now-playing-title") as HTMLElement;
  const npSub = sidebar.querySelector("#now-playing-sub") as HTMLElement;
  const npDomain = sidebar.querySelector("#now-playing-domain") as HTMLElement;
  const npIcon = sidebar.querySelector("#now-playing-icon") as HTMLElement;
  const visualizerBars = sidebar.querySelector("#visualizer-bars") as HTMLElement;
  const btnJumpTab = sidebar.querySelector("#btn-media-jump-tab") as HTMLButtonElement;
  const seekSlider = sidebar.querySelector("#media-seek-slider") as HTMLInputElement;
  const timeCurrent = sidebar.querySelector("#media-time-current") as HTMLElement;
  const timeTotal = sidebar.querySelector("#media-time-total") as HTMLElement;
  const btnPlayPause = sidebar.querySelector("#btn-media-play-pause") as HTMLButtonElement;
  const playIcon = sidebar.querySelector("#media-play-icon") as HTMLElement;
  const btnPrev = sidebar.querySelector("#btn-media-prev") as HTMLButtonElement;
  const btnNext = sidebar.querySelector("#btn-media-next") as HTMLButtonElement;
  const btnMute = sidebar.querySelector("#btn-media-mute") as HTMLButtonElement;
  const volumeIcon = sidebar.querySelector("#media-volume-icon") as HTMLElement;
  const volumeSlider = sidebar.querySelector("#media-volume-slider") as HTMLInputElement;
  const volumeLabel = sidebar.querySelector("#media-volume-label") as HTMLElement;
  const btnPip = sidebar.querySelector("#btn-media-pip") as HTMLButtonElement;

  // Streaming apps list & add form
  const appsList = sidebar.querySelector("#streaming-apps-list") as HTMLElement;
  const btnAddQuickApp = sidebar.querySelector("#btn-add-quick-app") as HTMLButtonElement;
  const addQuickAppForm = sidebar.querySelector("#add-quick-app-form") as HTMLFormElement;
  const quickAppNameInput = sidebar.querySelector("#quick-app-name-input") as HTMLInputElement;
  const quickAppUrlInput = sidebar.querySelector("#quick-app-url-input") as HTMLInputElement;
  const btnCancelQuickApp = sidebar.querySelector("#btn-cancel-quick-app") as HTMLButtonElement;

  // Render Quick Apps List
  function renderStreamingApps() {
    if (!appsList) return;
    const allApps: QuickApp[] = [...DEFAULT_QUICK_APPS, ...customApps];
    appsList.innerHTML = allApps.map((app, index) => {
      const customIdx = index - DEFAULT_QUICK_APPS.length;
      const safeName = escapeHtml(app.name);
      const safeUrl = escapeHtml(app.url);
      const safeDesc = escapeHtml(app.desc);
      return `
      <div class="p-3 rounded-xl bg-[#1a1a1d] border border-[#2c2c30] hover:border-[#3e3e44] transition-all flex items-center justify-between group">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#242428] text-white shadow-sm" style="color: ${escapeHtml(app.color)};">
            <span class="material-symbols-outlined text-[20px]">${escapeHtml(app.icon)}</span>
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-semibold text-white tracking-tight truncate">${safeName}</h4>
            <p class="text-[11px] text-neutral-400 mt-0.5 truncate max-w-[155px]">${safeDesc}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          ${
            app.custom
              ? `<button
                  type="button"
                  data-remove-idx="${customIdx}"
                  title="Remove app"
                  class="btn-remove-app w-7 h-7 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-[#27272b] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <span class="material-symbols-outlined text-[15px]">delete</span>
                </button>`
              : ""
          }
          <button
            type="button"
            data-app-url="${safeUrl}"
            data-app-name="${safeName}"
            class="btn-launch-app px-2.5 py-1.5 rounded-lg bg-[#27272b] hover:bg-[#f85e2a] hover:text-black text-xs font-medium text-neutral-200 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
          >
            <span>Open</span>
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        </div>
      </div>
    `;
    }).join("");

    appsList.querySelectorAll(".btn-launch-app").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-app-url");
        const name = btn.getAttribute("data-app-name");
        if (url) {
          onOpenUrl?.(url, name || "Music");
        }
      });
    });

    appsList.querySelectorAll(".btn-remove-app").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idxStr = btn.getAttribute("data-remove-idx");
        if (idxStr === null) return;
        const idx = parseInt(idxStr, 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < customApps.length) {
          customApps.splice(idx, 1);
          saveCustomApps(customApps);
          renderStreamingApps();
        }
      });
    });
  }

  btnAddQuickApp?.addEventListener("click", () => {
    if (!addQuickAppForm) return;
    const isHidden = addQuickAppForm.classList.contains("hidden");
    if (isHidden) {
      addQuickAppForm.classList.remove("hidden");
      quickAppNameInput?.focus();
    } else {
      addQuickAppForm.classList.add("hidden");
    }
  });

  btnCancelQuickApp?.addEventListener("click", () => {
    addQuickAppForm?.classList.add("hidden");
    addQuickAppForm?.reset();
  });

  addQuickAppForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = quickAppNameInput?.value.trim();
    let url = quickAppUrlInput?.value.trim();
    if (!name || !url) return;

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    let desc = url;
    try {
      desc = new URL(url).hostname.replace(/^www\./, "");
    } catch {}

    customApps.push({
      name,
      url,
      icon: "language",
      color: "#f85e2a",
      desc,
      custom: true,
    });
    saveCustomApps(customApps);
    renderStreamingApps();
    addQuickAppForm.reset();
    addQuickAppForm.classList.add("hidden");
  });

  // Navigation tab switcher
  function switchTab(section: "now-playing" | "apps") {
    activeSection = section;
    if (headerSub) {
      headerSub.textContent =
        activeSection === "now-playing" ? "Tab control & playback" : "Quick app shortcuts";
    }
    const tabs = [
      { id: "now-playing", btn: tabBtnNowPlaying, sec: secNowPlaying },
      { id: "apps", btn: tabBtnApps, sec: secApps },
    ];

    tabs.forEach((t) => {
      if (t.id === section) {
        t.btn.classList.add("bg-[#242428]", "text-white", "shadow-sm");
        t.btn.classList.remove("text-neutral-400", "hover:text-white", "hover:bg-[#202022]");
        t.sec.classList.remove("hidden");
      } else {
        t.btn.classList.remove("bg-[#242428]", "text-white", "shadow-sm");
        t.btn.classList.add("text-neutral-400", "hover:text-white", "hover:bg-[#202022]");
        t.sec.classList.add("hidden");
      }
    });
  }

  tabBtnNowPlaying?.addEventListener("click", () => switchTab("now-playing"));
  tabBtnApps?.addEventListener("click", () => switchTab("apps"));

  // Overall Media State Notification (updates dock indicator)
  function notifyOverallMediaState() {
    const isAnyPlaying = isTabMediaPlaying;
    onMediaStateChange?.(isAnyPlaying);

    if (visualizerBars) {
      if (isAnyPlaying) {
        visualizerBars.classList.remove("hidden");
      } else {
        visualizerBars.classList.add("hidden");
      }
    }

    if (headerIcon) {
      headerIcon.textContent = isAnyPlaying ? "graphic_eq" : "music_note";
    }
  }

  // Tab Playback Control Event Handlers
  btnPlayPause?.addEventListener("click", async () => {
    isTabMediaPlaying = !isTabMediaPlaying;
    if (playIcon) {
      playIcon.textContent = isTabMediaPlaying ? "pause" : "play_arrow";
    }
    await tauriIpc.mediaCommand("play_pause", activeTabReference?.id);
    notifyOverallMediaState();
  });

  btnPrev?.addEventListener("click", async () => {
    await tauriIpc.mediaCommand("prev", activeTabReference?.id);
  });

  btnNext?.addEventListener("click", async () => {
    await tauriIpc.mediaCommand("next", activeTabReference?.id);
  });

  seekSlider?.addEventListener("pointerdown", () => {
    isSeeking = true;
  });
  seekSlider?.addEventListener("pointerup", () => {
    isSeeking = false;
  });
  seekSlider?.addEventListener("change", () => {
    isSeeking = false;
  });

  seekSlider?.addEventListener("input", async () => {
    const val = parseFloat(seekSlider.value) / 100;
    tabMediaSeek = val;
    if (timeCurrent) {
      const refDuration = tabMediaDuration > 0 ? tabMediaDuration : 180;
      timeCurrent.textContent = formatTime(tabMediaSeek * refDuration);
    }
    if (timeTotal && timeTotal.textContent === "--:--" && tabMediaDuration > 0) {
      timeTotal.textContent = formatTime(tabMediaDuration);
    }
    await tauriIpc.mediaCommand("seek", activeTabReference?.id, val);
  });

  btnMute?.addEventListener("click", async () => {
    isTabMediaMuted = !isTabMediaMuted;
    if (volumeIcon) {
      volumeIcon.textContent = isTabMediaMuted ? "volume_off" : tabMediaVolume < 0.5 ? "volume_down" : "volume_up";
    }
    await tauriIpc.mediaCommand("mute", activeTabReference?.id);
  });

  volumeSlider?.addEventListener("pointerdown", () => {
    isAdjustingVolume = true;
  });
  volumeSlider?.addEventListener("pointerup", () => {
    isAdjustingVolume = false;
  });
  volumeSlider?.addEventListener("change", () => {
    isAdjustingVolume = false;
  });

  volumeSlider?.addEventListener("input", async () => {
    const val = parseInt(volumeSlider.value, 10);
    tabMediaVolume = val / 100;
    isTabMediaMuted = val === 0;
    if (volumeLabel) volumeLabel.textContent = `${val}%`;
    if (volumeIcon) {
      volumeIcon.textContent = isTabMediaMuted ? "volume_off" : tabMediaVolume < 0.5 ? "volume_down" : "volume_up";
    }
    await tauriIpc.mediaCommand("volume", activeTabReference?.id, tabMediaVolume);
  });

  btnPip?.addEventListener("click", async () => {
    await tauriIpc.mediaCommand("pip", activeTabReference?.id);
  });

  btnJumpTab?.addEventListener("click", () => {
    if (activeTabReference) {
      onActivateTab?.(activeTabReference.id);
    }
  });

  btnClose?.addEventListener("click", () => {
    hide();
    onClose?.();
  });

  function resetMediaProgressUI() {
    isTabMediaPlaying = false;
    tabMediaDuration = 0;
    tabMediaSeek = 0;
    if (playIcon) playIcon.textContent = "play_arrow";
    if (seekSlider && !isSeeking) seekSlider.value = "0";
    if (timeCurrent) timeCurrent.textContent = "0:00";
    if (timeTotal) timeTotal.textContent = "--:--";
    notifyOverallMediaState();
  }

  function updateMediaState(state: WebviewMediaState) {
    if (!state.hasMedia) {
      if (isTabMediaPlaying || tabMediaDuration > 0) {
        resetMediaProgressUI();
      }
      return;
    }

    isTabMediaPlaying = state.isPlaying;
    isTabMediaMuted = state.muted;
    tabMediaVolume = state.volume;
    tabMediaDuration = state.duration > 0 ? state.duration : 0;

    if (playIcon) {
      playIcon.textContent = isTabMediaPlaying ? "pause" : "play_arrow";
    }

    if (!isSeeking) {
      const pct =
        tabMediaDuration > 0
          ? Math.max(0, Math.min(100, (state.currentTime / tabMediaDuration) * 100))
          : 0;
      if (seekSlider) seekSlider.value = pct.toFixed(1);
      if (timeCurrent) timeCurrent.textContent = formatTime(state.currentTime);
    }

    if (timeTotal) {
      timeTotal.textContent = tabMediaDuration > 0 ? formatTime(tabMediaDuration) : "--:--";
    }

    if (!isAdjustingVolume) {
      const volPct = Math.round(Math.max(0, Math.min(1, state.volume)) * 100);
      if (volumeSlider) volumeSlider.value = String(state.muted ? 0 : volPct);
      if (volumeLabel) volumeLabel.textContent = `${state.muted ? 0 : volPct}%`;
    }

    if (volumeIcon) {
      volumeIcon.textContent = state.muted || state.volume === 0
        ? "volume_off"
        : state.volume < 0.5
          ? "volume_down"
          : "volume_up";
    }

    if (state.title && npTitle) {
      npTitle.textContent = state.title;
    }
    if (state.artist && npSub) {
      npSub.textContent = state.artist;
    }

    notifyOverallMediaState();
  }

  function updateTabInfo(tab: MinimizedTab | null) {
    const isSameTab = tab?.id && activeTabReference?.id === tab.id;
    activeTabReference = tab;
    if (!isSameTab) {
      resetMediaProgressUI();
    }
    if (!tab) {
      if (npTitle) npTitle.textContent = "No active tab media";
      if (npSub) npSub.textContent = "Open YouTube, Spotify, or any media site";
      if (npDomain) npDomain.textContent = "Browser Media";
      if (npIcon) npIcon.textContent = "web";
      return;
    }

    const title = tab.title || "Untitled Tab";
    const url = tab.url || tab.leftUrl || "";

    if (npTitle) npTitle.textContent = title;

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      if (npDomain) npDomain.textContent = host;

      if (host.includes("youtube") || host.includes("youtu.be")) {
        if (npIcon) npIcon.textContent = "smart_display";
        if (npSub) npSub.textContent = "YouTube Video Playback";
      } else if (host.includes("spotify")) {
        if (npIcon) npIcon.textContent = "library_music";
        if (npSub) npSub.textContent = "Spotify Web Player";
      } else if (host.includes("soundcloud")) {
        if (npIcon) npIcon.textContent = "cloud";
        if (npSub) npSub.textContent = "SoundCloud Audio Stream";
      } else {
        if (npIcon) npIcon.textContent = "language";
        if (npSub) npSub.textContent = `${host} Web Media`;
      }
    } catch {
      if (npDomain) npDomain.textContent = "Active Tab";
      if (npSub) npSub.textContent = title;
    }
  }

  function show() {
    isDrawerVisible = true;
    sidebar.classList.remove("hidden");
  }

  function hide() {
    isDrawerVisible = false;
    sidebar.classList.add("hidden");
  }

  function toggle() {
    if (isDrawerVisible) {
      hide();
    } else {
      show();
    }
  }

  function setLeftOffset(offset: number) {
    sidebar.style.left = `${offset}px`;
  }

  // Initial render of quick apps
  renderStreamingApps();

  return {
    element: sidebar,
    show,
    hide,
    toggle,
    isOpen: () => isDrawerVisible,
    setLeftOffset,
    updateActiveTab: updateTabInfo,
    updateMediaState,
    destroy: () => {
      sidebar.remove();
    },
  };
}
