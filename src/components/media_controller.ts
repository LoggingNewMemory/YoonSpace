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

export interface MediaController {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  setLeftOffset: (offset: number) => void;
  updateActiveTab: (tab: MinimizedTab | null) => void;
  destroy: () => void;
}

interface FocusStation {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  accent: string;
}

const FOCUS_STATIONS: FocusStation[] = [
  {
    id: "rain",
    name: "Rain & Thunder",
    category: "Nature Ambience",
    icon: "rainy",
    description: "Deep soothing rainstorm with distant thunder rumbles",
    accent: "#38bdf8",
  },
  {
    id: "lofi",
    name: "Lo-Fi Study Beats",
    category: "Coding & Study",
    icon: "headphones",
    description: "Mellow chords, chillhop rhythm & subtle vinyl crackle",
    accent: "#f85e2a",
  },
  {
    id: "synthwave",
    name: "Synthwave Cyberpunk",
    category: "Engineering Focus",
    icon: "electric_bolt",
    description: "Pulsing retro synthesizer bassline and 80s neon rhythm",
    accent: "#ec4899",
  },
  {
    id: "waves",
    name: "Ocean Waves",
    category: "Alpha Focus",
    icon: "water",
    description: "Rhythmic shoreline tides for deep concentration",
    accent: "#2dd4bf",
  },
  {
    id: "cafe",
    name: "Coffee Shop",
    category: "Warm Background",
    icon: "coffee",
    description: "Atmospheric acoustic warmth of a late-night cafe",
    accent: "#f59e0b",
  },
];

const STREAMING_APPS = [
  {
    name: "Spotify",
    url: "https://open.spotify.com",
    icon: "library_music",
    color: "#1db954",
    desc: "Stream millions of songs & playlists",
  },
  {
    name: "YouTube Music",
    url: "https://music.youtube.com",
    icon: "smart_display",
    color: "#ff0000",
    desc: "Official albums, live tracks & remixes",
  },
  {
    name: "SoundCloud",
    url: "https://soundcloud.com",
    icon: "cloud",
    color: "#ff5500",
    desc: "Indie artists, DJ mixes & electronic",
  },
  {
    name: "Apple Music",
    url: "https://music.apple.com",
    icon: "music_note",
    color: "#fa2d48",
    desc: "Lossless audio & curated radio stations",
  },
  {
    name: "Lofi Girl",
    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    icon: "radio",
    color: "#f85e2a",
    desc: "24/7 lofi hip hop radio to study & code",
  },
];

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
  let activeSection: "now-playing" | "focus" | "apps" = "now-playing";

  // Tab media playback state
  let isTabMediaPlaying = false;
  let isTabMediaMuted = false;
  let tabMediaVolume = 1.0;
  let tabMediaSeek = 0;

  // Built-in Focus Sound Audio Engine
  let audioCtx: AudioContext | null = null;
  let isFocusPlaying = false;
  let currentStationId = "rain";
  let focusVolume = 0.7;
  let masterGainNode: GainNode | null = null;
  let activeAudioNodes: { stop?: () => void; disconnect?: () => void }[] = [];
  let lofiTimer: number | null = null;
  let synthwaveTimer: number | null = null;

  sidebar.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2e2e30] bg-[#1a1a1c]">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-[#28282b] flex items-center justify-center text-[#f85e2a]">
          <span id="media-header-icon" class="material-symbols-outlined text-[18px]">music_note</span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white tracking-tight">Music &amp; Media</h2>
            <span id="media-status-pill" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f85e2a]/20 text-[#f85e2a] border border-[#f85e2a]/30">STANDBY</span>
          </div>
          <p id="media-header-sub" class="text-[11px] text-neutral-400 font-mono mt-0.5 truncate max-w-[200px]">Tab control &amp; focus audio</p>
        </div>
      </div>

      <button
        type="button"
        id="btn-close-media"
        aria-label="Close Media Control"
        title="Close Media Control (Ctrl+M)"
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
        id="tab-btn-focus"
        class="media-nav-tab flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer text-neutral-400 hover:text-white hover:bg-[#202022] flex items-center justify-center gap-1.5"
      >
        <span class="material-symbols-outlined text-[15px]">headphones</span>
        <span>Focus Sounds</span>
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

          <div class="grid grid-cols-2 gap-2 pt-1 border-t border-[#26262a]">
            <button
              type="button"
              id="btn-media-pip"
              class="py-1.5 px-2.5 rounded-lg bg-[#242428] hover:bg-[#2d2d32] text-neutral-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px] text-[#ffb59e]">picture_in_picture_alt</span>
              <span>Pop-out PiP</span>
            </button>

            <button
              type="button"
              id="btn-media-open-lofi"
              class="py-1.5 px-2.5 rounded-lg bg-[#242428] hover:bg-[#2d2d32] text-neutral-300 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span class="material-symbols-outlined text-[16px] text-[#f85e2a]">radio</span>
              <span>Lofi Stream</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 2. FOCUS AMBIENT SOUNDS SECTION -->
      <section id="section-focus" class="space-y-4 hidden">
        <!-- Focus Player Banner Card -->
        <div class="rounded-2xl bg-gradient-to-br from-[#1e2329] via-[#191d24] to-[#14161a] border border-[#2b3540] p-4 shadow-lg space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-[#38bdf8]">headphones</span>
              <h3 class="text-sm font-semibold text-white">Engineers' Focus Sounds</h3>
            </div>
            <span id="focus-live-badge" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30">OFFLINE READY</span>
          </div>
          <p class="text-xs text-neutral-400 leading-relaxed">
            Synthesized Web Audio ambience for zero latency coding without internet buffering.
          </p>

          <!-- Current Focus Station Card -->
          <div class="rounded-xl bg-[#111317] border border-[#28303b] p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div id="focus-station-icon-box" class="w-10 h-10 rounded-lg bg-[#1e293b] flex items-center justify-center text-[#38bdf8] shrink-0">
                <span id="focus-station-icon" class="material-symbols-outlined text-[22px]">rainy</span>
              </div>
              <div>
                <h4 id="focus-station-name" class="text-xs font-semibold text-white">Rain &amp; Thunder</h4>
                <p id="focus-station-desc" class="text-[11px] text-neutral-400 mt-0.5">Deep soothing rainstorm</p>
              </div>
            </div>

            <!-- Master Focus Toggle Button -->
            <button
              type="button"
              id="btn-focus-toggle-play"
              class="w-10 h-10 rounded-full bg-[#38bdf8] hover:bg-[#60a5fa] text-slate-900 shadow-md flex items-center justify-center active:scale-95 transition-all cursor-pointer font-bold shrink-0"
              title="Play / Pause Focus Audio"
            >
              <span id="focus-play-icon" class="material-symbols-outlined text-[22px]">play_arrow</span>
            </button>
          </div>

          <!-- Focus Volume Slider -->
          <div class="flex items-center gap-2 pt-1">
            <span class="material-symbols-outlined text-[17px] text-neutral-400">volume_down</span>
            <input
              type="range"
              id="focus-volume-slider"
              min="0"
              max="100"
              value="70"
              class="flex-1 h-1.5 bg-[#252d38] rounded-lg appearance-none cursor-pointer accent-[#38bdf8]"
            />
            <span id="focus-volume-label" class="text-[11px] font-mono text-neutral-400 w-8 text-right">70%</span>
          </div>
        </div>

        <!-- Station Selector List -->
        <div class="space-y-2">
          <label class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400 px-1">Choose Soundscape</label>
          <div class="grid grid-cols-1 gap-2" id="focus-stations-list">
            <!-- Dynamically populated -->
          </div>
        </div>
      </section>

      <!-- 3. QUICK STREAMING APPS SECTION -->
      <section id="section-apps" class="space-y-3 hidden">
        <div class="flex items-center justify-between px-1">
          <label class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Launch Music Services</label>
          <span class="text-[10px] text-neutral-500 font-mono">1-Click Tab</span>
        </div>

        <div class="grid grid-cols-1 gap-2.5" id="streaming-apps-list">
          <!-- Dynamically populated -->
        </div>
      </section>
    </div>

    <!-- Footer -->
    <div class="px-4 py-2.5 border-t border-[#2e2e30] bg-[#1a1a1c] flex items-center justify-between text-[11px] text-neutral-400">
      <div class="flex items-center gap-1.5">
        <span class="material-symbols-outlined text-sm text-[#f85e2a]">tune</span>
        <span>YoonSpace Audio Hub</span>
      </div>
      <span class="font-mono text-[10px] text-neutral-500">Shortcut: Ctrl+M</span>
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
  const statusPill = sidebar.querySelector("#media-status-pill") as HTMLElement;
  const headerIcon = sidebar.querySelector("#media-header-icon") as HTMLElement;
  const headerSub = sidebar.querySelector("#media-header-sub") as HTMLElement;

  // Nav buttons
  const tabBtnNowPlaying = sidebar.querySelector("#tab-btn-now-playing") as HTMLButtonElement;
  const tabBtnFocus = sidebar.querySelector("#tab-btn-focus") as HTMLButtonElement;
  const tabBtnApps = sidebar.querySelector("#tab-btn-apps") as HTMLButtonElement;

  // Sections
  const secNowPlaying = sidebar.querySelector("#section-now-playing") as HTMLElement;
  const secFocus = sidebar.querySelector("#section-focus") as HTMLElement;
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
  const btnOpenLofi = sidebar.querySelector("#btn-media-open-lofi") as HTMLButtonElement;

  // Focus Audio Controls
  const btnFocusToggle = sidebar.querySelector("#btn-focus-toggle-play") as HTMLButtonElement;
  const focusPlayIcon = sidebar.querySelector("#focus-play-icon") as HTMLElement;
  const focusStationName = sidebar.querySelector("#focus-station-name") as HTMLElement;
  const focusStationDesc = sidebar.querySelector("#focus-station-desc") as HTMLElement;
  const focusStationIcon = sidebar.querySelector("#focus-station-icon") as HTMLElement;
  const focusVolumeSlider = sidebar.querySelector("#focus-volume-slider") as HTMLInputElement;
  const focusVolumeLabel = sidebar.querySelector("#focus-volume-label") as HTMLElement;
  const focusStationsList = sidebar.querySelector("#focus-stations-list") as HTMLElement;

  // Streaming apps list
  const appsList = sidebar.querySelector("#streaming-apps-list") as HTMLElement;

  // Render Focus Stations List
  function renderFocusStations() {
    if (!focusStationsList) return;
    focusStationsList.innerHTML = FOCUS_STATIONS.map((station) => {
      const isSelected = station.id === currentStationId;
      return `
        <button
          type="button"
          data-station-id="${station.id}"
          class="focus-station-card w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
            isSelected
              ? "bg-[#202734] border-[#38bdf8] text-white shadow-sm"
              : "bg-[#181a1f] border-[#292c34] text-neutral-300 hover:bg-[#20232a] hover:border-[#383d49]"
          }"
        >
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isSelected ? "bg-[#38bdf8]/20 text-[#38bdf8]" : "bg-[#252830] text-neutral-400"
            }">
              <span class="material-symbols-outlined text-[18px]">${station.icon}</span>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold">${station.name}</span>
                <span class="text-[9px] font-mono px-1 rounded bg-[#272b35] text-neutral-400">${station.category}</span>
              </div>
              <p class="text-[11px] text-neutral-400 truncate max-w-[200px] mt-0.5">${station.description}</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-[16px] ${isSelected ? "text-[#38bdf8]" : "text-neutral-500"}">
            ${isSelected && isFocusPlaying ? "graphic_eq" : isSelected ? "check_circle" : "play_circle"}
          </span>
        </button>
      `;
    }).join("");

    focusStationsList.querySelectorAll(".focus-station-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-station-id");
        if (!id) return;
        selectFocusStation(id);
      });
    });
  }

  // Render Streaming Apps List
  function renderStreamingApps() {
    if (!appsList) return;
    appsList.innerHTML = STREAMING_APPS.map((app) => `
      <div class="p-3 rounded-xl bg-[#1a1a1d] border border-[#2c2c30] hover:border-[#3e3e44] transition-all flex items-center justify-between group">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-[#242428] text-white shadow-sm" style="color: ${app.color};">
            <span class="material-symbols-outlined text-[20px]">${app.icon}</span>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-white tracking-tight">${app.name}</h4>
            <p class="text-[11px] text-neutral-400 mt-0.5 truncate max-w-[170px]">${app.desc}</p>
          </div>
        </div>

        <button
          type="button"
          data-app-url="${app.url}"
          data-app-name="${app.name}"
          class="btn-launch-app px-2.5 py-1.5 rounded-lg bg-[#27272b] hover:bg-[#f85e2a] hover:text-black text-xs font-medium text-neutral-200 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
        >
          <span>Open</span>
          <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    `).join("");

    appsList.querySelectorAll(".btn-launch-app").forEach((btn) => {
      btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-app-url");
        const name = btn.getAttribute("data-app-name");
        if (url) {
          onOpenUrl?.(url, name || "Music");
        }
      });
    });
  }

  // Navigation tab switcher
  function switchTab(section: "now-playing" | "focus" | "apps") {
    activeSection = section;
    if (headerSub) {
      if (activeSection === "now-playing") {
        headerSub.textContent = "Tab control & playback";
      } else if (activeSection === "focus") {
        headerSub.textContent = "Engineers' ambient audio";
      } else {
        headerSub.textContent = "Streaming service shortcuts";
      }
    }
    const tabs = [
      { id: "now-playing", btn: tabBtnNowPlaying, sec: secNowPlaying },
      { id: "focus", btn: tabBtnFocus, sec: secFocus },
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
  tabBtnFocus?.addEventListener("click", () => switchTab("focus"));
  tabBtnApps?.addEventListener("click", () => switchTab("apps"));

  // Web Audio Context initialization
  function ensureAudioContext(): AudioContext {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioCtxClass();
      masterGainNode = audioCtx.createGain();
      masterGainNode.gain.setValueAtTime(focusVolume, audioCtx.currentTime);
      masterGainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function stopFocusAudio() {
    activeAudioNodes.forEach((node) => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {}
    });
    activeAudioNodes = [];
    if (lofiTimer) {
      window.clearInterval(lofiTimer);
      lofiTimer = null;
    }
    if (synthwaveTimer) {
      window.clearInterval(synthwaveTimer);
      synthwaveTimer = null;
    }
    isFocusPlaying = false;
    updateFocusUI();
    notifyOverallMediaState();
  }

  function startFocusAudio(stationId: string) {
    stopFocusAudio();
    const ctx = ensureAudioContext();
    if (!masterGainNode) return;

    currentStationId = stationId;

    if (stationId === "rain") {
      // 1. Pink Noise rain generator with Paul Kellet's algorithm
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "lowpass";
      rainFilter.frequency.setValueAtTime(800, ctx.currentTime);

      whiteNoise.connect(rainFilter);
      rainFilter.connect(masterGainNode);
      whiteNoise.start();
      activeAudioNodes.push(whiteNoise, rainFilter);

      // Periodic gentle thunder rumble
      const thunderInterval = window.setInterval(() => {
        if (!isFocusPlaying) return;
        try {
          const osc = ctx.createOscillator();
          const thunderGain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(55, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 3.0);

          thunderGain.gain.setValueAtTime(0.01, ctx.currentTime);
          thunderGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.8);
          thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.2);

          osc.connect(thunderGain);
          thunderGain.connect(masterGainNode!);
          osc.start();
          osc.stop(ctx.currentTime + 3.5);
        } catch {}
      }, 9000);
      lofiTimer = thunderInterval;

    } else if (stationId === "waves") {
      // 2. Modulated Shoreline Ocean Waves
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.2;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(320, ctx.currentTime);
      filter.Q.setValueAtTime(1.2, ctx.currentTime);

      const waveGain = ctx.createGain();
      waveGain.gain.setValueAtTime(0.2, ctx.currentTime);

      // Slow LFO for ocean wave swells (0.12 Hz)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.12, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.35, ctx.currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(waveGain.gain);

      noise.connect(filter);
      filter.connect(waveGain);
      waveGain.connect(masterGainNode);

      lfo.start();
      noise.start();
      activeAudioNodes.push(noise, filter, waveGain, lfo, lfoGain);

    } else if (stationId === "lofi") {
      // 3. Relaxing Lo-Fi chords + vinyl crackle
      const chordNotes = [
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [220.0, 261.63, 329.63, 392.0],  // Am7
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 349.23], // G7
      ];
      let chordIndex = 0;

      const playChord = () => {
        if (!isFocusPlaying) return;
        const currentNotes = chordNotes[chordIndex % chordNotes.length];
        chordIndex++;

        currentNotes.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, ctx.currentTime);

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(750, ctx.currentTime);

          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.4);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.2);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(masterGainNode!);

          osc.start();
          osc.stop(ctx.currentTime + 3.4);
        });
      };

      playChord();
      lofiTimer = window.setInterval(playChord, 3500);

    } else if (stationId === "synthwave") {
      // 4. Synthwave Cyberpunk Rhythm
      const bassNotes = [110, 110, 130.81, 146.83, 110, 164.81, 146.83, 98];
      let step = 0;

      const playBass = () => {
        if (!isFocusPlaying) return;
        const freq = bassNotes[step % bassNotes.length];
        step++;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(600, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.09, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGainNode!);

        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      };

      playBass();
      synthwaveTimer = window.setInterval(playBass, 260);

    } else if (stationId === "cafe") {
      // 5. Warm Cafe Acoustic Ambience
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 0.6;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(550, ctx.currentTime);
      filter.Q.setValueAtTime(0.8, ctx.currentTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGainNode);

      noise.start();
      activeAudioNodes.push(noise, filter, gain);
    }

    isFocusPlaying = true;
    updateFocusUI();
    notifyOverallMediaState();
  }

  function selectFocusStation(stationId: string) {
    currentStationId = stationId;
    const station = FOCUS_STATIONS.find((s) => s.id === stationId);
    if (station) {
      if (focusStationName) focusStationName.textContent = station.name;
      if (focusStationDesc) focusStationDesc.textContent = station.description;
      if (focusStationIcon) focusStationIcon.textContent = station.icon;
    }
    renderFocusStations();
    if (isFocusPlaying) {
      startFocusAudio(stationId);
    }
  }

  function updateFocusUI() {
    if (focusPlayIcon) {
      focusPlayIcon.textContent = isFocusPlaying ? "pause" : "play_arrow";
    }
    renderFocusStations();
  }

  btnFocusToggle?.addEventListener("click", () => {
    if (isFocusPlaying) {
      stopFocusAudio();
    } else {
      startFocusAudio(currentStationId);
    }
  });

  focusVolumeSlider?.addEventListener("input", () => {
    const val = parseInt(focusVolumeSlider.value, 10);
    focusVolume = val / 100;
    if (focusVolumeLabel) focusVolumeLabel.textContent = `${val}%`;
    if (masterGainNode && audioCtx) {
      masterGainNode.gain.setValueAtTime(focusVolume, audioCtx.currentTime);
    }
  });

  // Overall Media State Notification (updates dock indicator)
  function notifyOverallMediaState() {
    const isAnyPlaying = isFocusPlaying || isTabMediaPlaying;
    onMediaStateChange?.(isAnyPlaying);

    if (statusPill) {
      if (isFocusPlaying) {
        statusPill.textContent = "FOCUS AUDIO";
        statusPill.className = "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30";
      } else if (isTabMediaPlaying) {
        statusPill.textContent = "PLAYING";
        statusPill.className = "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f85e2a]/20 text-[#f85e2a] border border-[#f85e2a]/30";
      } else {
        statusPill.textContent = "STANDBY";
        statusPill.className = "px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400 border border-neutral-700";
      }
    }

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

  seekSlider?.addEventListener("input", async () => {
    const val = parseFloat(seekSlider.value) / 100;
    tabMediaSeek = val;
    if (timeCurrent) {
      const totalEstimatedSecs = 180;
      const curSecs = Math.round(tabMediaSeek * totalEstimatedSecs);
      const mins = Math.floor(curSecs / 60);
      const secs = curSecs % 60;
      timeCurrent.textContent = `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    }
    if (timeTotal && timeTotal.textContent === "--:--") {
      timeTotal.textContent = "3:00";
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

  btnOpenLofi?.addEventListener("click", () => {
    onOpenUrl?.("https://www.youtube.com/watch?v=jfKfPfyJRdk", "Lofi Girl");
  });

  btnClose?.addEventListener("click", () => {
    hide();
    onClose?.();
  });

  function updateTabInfo(tab: MinimizedTab | null) {
    activeTabReference = tab;
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

  // Initial render of sub-lists
  renderFocusStations();
  renderStreamingApps();

  return {
    element: sidebar,
    show,
    hide,
    toggle,
    isOpen: () => isDrawerVisible,
    setLeftOffset,
    updateActiveTab: updateTabInfo,
    destroy: () => {
      stopFocusAudio();
      sidebar.remove();
    },
  };
}
