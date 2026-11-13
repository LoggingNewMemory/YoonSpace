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
import { initShieldUI, type ShieldController } from "./shield";

export interface TitlebarElement extends HTMLElement {
  shieldController?: ShieldController;
}

export function createTitlebar(
  onNavigate: (url: string) => void,
  onHomeClick: () => void,
  onBack?: () => void,
  onForward?: () => void,
  onReload?: () => void,
  onShieldToggle?: (isOpen: boolean) => void
) {
  const container = document.createElement("header");
  container.className =
    "fixed top-0 left-0 right-0 z-50 flex flex-col bg-[#0e0e0e]/95 backdrop-blur-xl border-b border-[#202020] shadow-[0_1px_8px_rgba(0,0,0,0.4)]";

  container.innerHTML = `
    <!-- Window Drag Title Row -->
    <div id="titlebar-drag-strip" data-tauri-drag-region class="h-8 pl-3 pr-1.5 flex items-center justify-between select-none cursor-default drag-region">
      <div class="flex items-center gap-2 pointer-events-none">
        <span class="flex items-center gap-2 text-xs text-[#e2bfb4]">
          <img src="/logo.png" alt="YoonSpace" class="w-4 h-4 object-contain bg-transparent" />
          <span class="font-semibold text-[#e5e2e1] tracking-wide">YoonSpace</span>
        </span>
        <div class="h-3 w-px bg-[#353535] mx-1"></div>
        <span id="telemetry-badge" class="pointer-events-auto inline-flex items-center px-2 py-0.5 rounded bg-[#202020] text-[11px] font-medium text-[#ffb59e] border border-[#353535]/50 hover:border-[#f85e2a]/50 transition-colors cursor-help">
          <span id="telemetry-ram">-- MB RAM</span>
        </span>
      </div>

      <div class="flex-1 h-full drag-region" data-tauri-drag-region></div>

      <!-- Modern Crisp Window Controls (Ubuntu Yaru Ergonomics) -->
      <div class="flex items-center gap-1.5 no-drag">
        <!-- Minimize -->
        <button
          id="btn-win-min"
          aria-label="Minimize"
          title="Minimize"
          class="w-5 h-5 rounded-full bg-[#222222] hover:bg-[#383838] text-[#8e8a88] hover:text-[#e5e2e1] border border-white/5 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 5H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>

        <!-- Maximize -->
        <button
          id="btn-win-max"
          aria-label="Maximize"
          title="Maximize"
          class="w-5 h-5 rounded-full bg-[#222222] hover:bg-[#383838] text-[#8e8a88] hover:text-[#e5e2e1] border border-white/5 flex items-center justify-center transition-all cursor-pointer active:scale-95"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.75" y="1.75" width="6.5" height="6.5" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>

        <!-- Close / Exit -->
        <button
          id="btn-win-close"
          aria-label="Close"
          title="Close"
          class="w-5 h-5 rounded-full bg-[#2d1515] hover:bg-[#e95420] text-[#e06c6c] hover:text-white border border-red-500/10 hover:border-[#e95420] flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95"
          type="button"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.2 2.2L7.8 7.8M7.8 2.2L2.2 7.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Navigation / Omnibar Row -->
    <div class="h-12 px-4 flex items-center justify-center bg-[#1b1b1c]/95 border-t border-[#202020]/60 relative">
      <!-- Left Edge: Navigation Controls (Back, Forward, Reload) & Split Indicator -->
      <div class="absolute left-2 flex items-center gap-1.5 z-10">
        <div class="flex items-center gap-0.5">
          <button
            id="nav-btn-back"
            type="button"
            title="Back (Alt+Left)"
            aria-label="Back"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">arrow_back</span>
          </button>
          <button
            id="nav-btn-forward"
            type="button"
            title="Forward (Alt+Right)"
            aria-label="Forward"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
          <button
            id="nav-btn-reload"
            type="button"
            title="Reload (Ctrl+R / F5)"
            aria-label="Reload"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer"
          >
            <span class="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>

        <div id="split-active-indicator" class="hidden items-center gap-1.5 px-2 py-0.5 rounded bg-[#f85e2a]/20 border border-[#f85e2a]/40 text-[#ffb59e] text-[11px] font-medium">
          <span class="material-symbols-outlined text-[14px]">splitscreen</span>
          <span>Dual Split Active</span>
          <button id="btn-close-split" class="ml-1 hover:text-white cursor-pointer" title="Close Split View">
            <span class="material-symbols-outlined text-[12px]">close</span>
          </button>
        </div>
      </div>

      <!-- Centered Address / Omnibar Form -->
      <form id="global-omnibar-form" class="w-full max-w-2xl mx-auto flex items-center">
        <div class="w-full h-8 px-3 bg-[#202020] rounded-lg flex items-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] border border-transparent focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all">
          <input
            id="global-omnibar-input"
            class="w-full bg-transparent border-0 outline-none text-xs text-[#e5e2e1] placeholder-[#ADABAA] focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
            placeholder="Search or enter address..."
            type="text"
            autocomplete="off"
          />
        </div>
      </form>

      <!-- Right Edge: Shield Button (gap 2 from edge) -->
      <div class="absolute right-2 flex items-center z-10">
        <button
          id="omnibar-shield-btn"
          type="button"
          title="YoonSpace Shields (Brave adblock-rust) - Shields UP"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#f85e2a] hover:text-[#ff7e4f] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0"
        >
          <span id="shield-icon" class="material-symbols-outlined text-[18px]">shield</span>
          <span id="shield-count-badge" class="text-[10px] font-mono font-semibold text-[#f85e2a] leading-none hidden">0</span>
        </button>
      </div>
    </div>
  `;

  // YoonSpace Shields Sidebar (Stitch Design: YoonSpace - Shields Sidebar)
  // Appended to document.body so it is NEVER constrained by header's backdrop-filter
  const sidebar = document.createElement("aside");
  sidebar.id = "yoonspace-shields-sidebar";
  sidebar.className =
    "hidden fixed right-0 top-[80px] bottom-0 z-40 w-[360px] flex flex-col border-l border-[#2e2e30] bg-[#171718] text-[#e5e2e1] shadow-2xl select-none overflow-hidden transition-all duration-200 ease-out";
  sidebar.style.top = "80px";
  sidebar.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-[#2e2e30] bg-[#1a1a1c]">
        <div class="flex items-center gap-2.5">
          <div>
            <div class="flex items-center gap-1.5">
              <h2 class="font-label-code-md text-sm font-semibold text-white tracking-tight">YoonSpace Shields</h2>
            </div>
            <p id="shield-site-domain" class="text-[11px] text-neutral-400 font-mono flex items-center gap-1 mt-0.5">Current Website</p>
          </div>
        </div>
      </div>

      <!-- Body / Scrollable Content -->
      <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar" style="scrollbar-width: none;">
        <!-- Toggle Card -->
        <div class="p-3.5 rounded-xl bg-[#202022] border border-[#2e2e32] shadow-sm">
          <label class="flex items-center justify-between cursor-pointer select-none group">
            <span class="text-xs font-semibold text-neutral-200 font-mono group-hover:text-white transition-colors">Enable YoonSpace Shields</span>
            <div class="relative inline-flex items-center cursor-pointer shrink-0">
              <input id="shield-toggle-input" checked="" class="sr-only peer" type="checkbox">
              <div class="w-11 h-6 bg-[#3a3a3e] peer-checked:bg-[#e95420] rounded-full transition-colors duration-200 ease-in-out"></div>
              <div class="absolute left-0 top-0 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out translate-x-0 peer-checked:translate-x-5 pointer-events-none"></div>
            </div>
          </label>
        </div>

        <!-- Blocked Counter & Breakdown Card -->
        <div class="p-3.5 rounded-xl bg-[#202022] border border-[#2e2e32] shadow-sm space-y-3">
          <div class="flex items-center justify-between py-1 px-1">
            <div class="flex flex-col justify-center text-left">
              <span class="text-xs text-neutral-300 font-medium leading-tight">Blocked on this page</span>
              <p class="text-[10px] text-neutral-400 mt-0.5 leading-tight">ads, trackers &amp; video interruptions</p>
            </div>
            <span id="shield-stat-count" class="text-3xl font-extrabold text-[#e95420] font-mono leading-none">0</span>
          </div>
          <div class="space-y-2 pt-2 border-t border-[#2e2e32]">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-neutral-300">Trackers &amp; Fingerprinting</span>
              <span id="shield-stat-trackers" class="font-mono text-white font-medium">0</span>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-neutral-300">Cross-site Ads &amp; Popups</span>
              <span id="shield-stat-ads" class="font-mono text-white font-medium">0</span>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-neutral-300">Cryptominers &amp; Malicious Scripts</span>
              <span id="shield-stat-miners" class="font-mono text-white font-medium">0</span>
            </div>
          </div>
        </div>

        <!-- Privacy Protections Card -->
        <div class="p-3.5 rounded-xl bg-[#202022] border border-[#2e2e32] shadow-sm space-y-3">
          <!-- Block Trackers -->
          <label class="flex items-center justify-between text-xs cursor-pointer select-none group">
            <span class="text-neutral-300 group-hover:text-neutral-100 transition-colors">Block cross-site trackers</span>
            <div class="relative flex items-center justify-center shrink-0">
              <input id="shield-opt-trackers" type="checkbox" checked class="sr-only peer">
              <div class="w-[18px] h-[18px] rounded-[5px] border border-[#3e3e44] bg-[#18181b] peer-checked:bg-[#e95420] peer-checked:border-[#e95420] peer-checked:[&>svg]:opacity-100 flex items-center justify-center transition-all duration-150 shadow-inner group-hover:border-[#5a5a64] shrink-0">
                <svg class="w-3.5 h-3.5 text-white opacity-0 transition-opacity duration-150 block shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4.5 12L9.5 17L19.5 7"></path>
                </svg>
              </div>
            </div>
          </label>

          <!-- HTTPS Upgrade -->
          <label class="flex items-center justify-between text-xs cursor-pointer select-none group">
            <span class="text-neutral-300 group-hover:text-neutral-100 transition-colors">Upgrade connections to HTTPS</span>
            <div class="relative flex items-center justify-center shrink-0">
              <input id="shield-opt-https" type="checkbox" checked class="sr-only peer">
              <div class="w-[18px] h-[18px] rounded-[5px] border border-[#3e3e44] bg-[#18181b] peer-checked:bg-[#e95420] peer-checked:border-[#e95420] peer-checked:[&>svg]:opacity-100 flex items-center justify-center transition-all duration-150 shadow-inner group-hover:border-[#5a5a64] shrink-0">
                <svg class="w-3.5 h-3.5 text-white opacity-0 transition-opacity duration-150 block shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4.5 12L9.5 17L19.5 7"></path>
                </svg>
              </div>
            </div>
          </label>

          <!-- Aggressive Sandboxing -->
          <label class="flex items-center justify-between text-xs cursor-pointer select-none group">
            <span class="text-neutral-300 group-hover:text-neutral-100 transition-colors">Aggressive script sandboxing</span>
            <div class="relative flex items-center justify-center shrink-0">
              <input id="shield-opt-sandbox" type="checkbox" class="sr-only peer">
              <div class="w-[18px] h-[18px] rounded-[5px] border border-[#3e3e44] bg-[#18181b] peer-checked:bg-[#e95420] peer-checked:border-[#e95420] peer-checked:[&>svg]:opacity-100 flex items-center justify-center transition-all duration-150 shadow-inner group-hover:border-[#5a5a64] shrink-0">
                <svg class="w-3.5 h-3.5 text-white opacity-0 transition-opacity duration-150 block shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4.5 12L9.5 17L19.5 7"></path>
                </svg>
              </div>
            </div>
          </label>
        </div>

        <!-- Engine Attribution Card -->
        <div class="p-3 rounded-xl bg-[#1c1c1e] border border-[#2a2a2e] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div>
              <div class="text-xs font-semibold text-neutral-200 font-mono">Brave adblock-rust</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-300 border border-neutral-700">MPL-2.0</span>
        </div>
      </div>
  `;

  // Attach to body immediately or on DOM ready
  if (document.body) {
    document.body.appendChild(sidebar);
  } else {
    window.addEventListener("DOMContentLoaded", () => document.body.appendChild(sidebar));
  }

  // Window drag handling
  const dragStrip = container.querySelector("#titlebar-drag-strip") as HTMLElement;
  dragStrip?.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (target.closest("button, input, a, .no-drag, #telemetry-badge")) {
        return;
      }
      if (e.detail === 2) {
        tauriIpc.toggleMaximizeWindow();
      } else {
        tauriIpc.startDragging();
      }
    }
  });

  // Attach button event handlers
  container.querySelector("#btn-win-min")?.addEventListener("click", () => tauriIpc.minimizeWindow());
  container.querySelector("#btn-win-max")?.addEventListener("click", () => tauriIpc.toggleMaximizeWindow());
  container.querySelector("#btn-win-close")?.addEventListener("click", () => tauriIpc.closeWindow());

  // Navigation controls handlers
  container.querySelector("#nav-btn-back")?.addEventListener("click", () => {
    onBack?.();
  });
  container.querySelector("#nav-btn-forward")?.addEventListener("click", () => {
    onForward?.();
  });
  container.querySelector("#nav-btn-reload")?.addEventListener("click", () => {
    onReload?.();
  });

  const form = container.querySelector("#global-omnibar-form") as HTMLFormElement;
  const input = container.querySelector("#global-omnibar-input") as HTMLInputElement;

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      onNavigate(query);
    }
  });

  container.querySelector("#btn-close-split")?.addEventListener("click", async () => {
    await tauriIpc.closeSplit();
    const indicator = container.querySelector("#split-active-indicator");
    indicator?.classList.add("hidden");
    indicator?.classList.remove("flex");
    onHomeClick();
  });

  // Query actual RAM immediately so it shows real memory usage on startup
  tauriIpc
    .getTelemetry()
    .then((stats) => {
      const ramBadge = container.querySelector("#telemetry-ram");
      const badgeContainer = container.querySelector("#telemetry-badge") as HTMLElement | null;
      if (ramBadge && stats) {
        ramBadge.textContent = `${stats.resident_mb.toFixed(0)} MB RAM`;
      }
      if (badgeContainer && stats) {
        const gpuInfo = stats.gpu_renderer ? `\nGPU: ${stats.gpu_renderer}` : "";
        badgeContainer.title = `Private RAM: ${stats.resident_mb} MB\nTotal RSS: ${stats.total_rss_mb} MB (incl. shared OS libs)\nShared Libs: ${stats.shared_mb} MB${gpuInfo}`;
      }
    })
    .catch((err) => {
      console.warn("Failed to get initial RAM telemetry:", err);
    });

  // Initialize YoonSpace Shields UI (Powered by Brave adblock-rust)
  const shieldBtn = container.querySelector("#omnibar-shield-btn") as HTMLButtonElement | null;
  const shieldBadge = container.querySelector("#shield-count-badge") as HTMLElement | null;
  const shieldIcon = container.querySelector("#shield-icon") as HTMLElement | null;
  const tray = (document.querySelector("#yoonspace-shields-sidebar") as HTMLElement | null) || sidebar;
  if (shieldBtn && shieldBadge && shieldIcon && tray) {
    const shieldController = initShieldUI(shieldBtn, shieldBadge, shieldIcon, tray, onShieldToggle);
    (container as TitlebarElement).shieldController = shieldController;
  }

  return container as TitlebarElement;
}
