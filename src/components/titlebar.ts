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

      <!-- Centered Address / Omnibar Form & Shield -->
      <form id="global-omnibar-form" class="w-full max-w-2xl mx-auto flex items-center gap-2">
        <div class="flex-1 h-8 px-3 bg-[#202020] rounded-lg flex items-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] border border-transparent focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all">
          <input
            id="global-omnibar-input"
            class="w-full bg-transparent border-0 outline-none text-xs text-[#e5e2e1] placeholder-[#ADABAA] focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
            placeholder="Search or enter address..."
            type="text"
            autocomplete="off"
          />
        </div>

        <button
          id="omnibar-shield-btn"
          type="button"
          title="YoonSpace Shields (Powered by Brave adblock-rust) - Shields UP"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#f85e2a] hover:text-[#ff7e4f] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0"
        >
          <span id="shield-icon" class="material-symbols-outlined text-[18px]">shield</span>
          <span id="shield-count-badge" class="text-[10px] font-mono font-semibold text-[#f85e2a] leading-none hidden">0</span>
        </button>
      </form>
    </div>

    <!-- YoonSpace Shields Tray Row -->
    <div id="yoonspace-shields-tray" class="hidden w-full border-t border-[#262626] bg-[#141415]/98 px-4 py-3 select-none">
      <div class="max-w-2xl mx-auto flex flex-col gap-2.5">
        <!-- Top Row: Title, Origin, Status, Switch, Close -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div id="shield-header-icon-box" class="w-7 h-7 rounded-lg bg-[#f85e2a]/15 flex items-center justify-center text-[#f85e2a]">
              <span class="material-symbols-outlined text-[18px]">shield</span>
            </div>
            <div>
              <div class="text-xs font-semibold tracking-wide text-[#e5e2e1]">YoonSpace Shields</div>
              <div id="shield-site-domain" class="text-[11px] text-[#9c9a98] font-mono truncate max-w-xs">Current Website</div>
            </div>
            <div id="shield-status-label" class="ml-2 text-[10px] text-[#22c55e] font-medium flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20">
              <span class="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
              <span>Shields UP</span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" id="shield-toggle-input" class="sr-only peer" checked>
              <div class="w-9 h-5 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f85e2a]"></div>
            </label>
            <button id="shield-popover-close" class="text-[#858280] hover:text-[#e5e2e1] p-1 rounded-md hover:bg-[#252525] transition-all cursor-pointer" title="Close Shields Panel">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>

        <!-- Bottom Row: Counter & Brave attribution -->
        <div class="flex items-center justify-between pt-2 border-t border-[#222222] text-xs">
          <div class="flex items-center gap-2">
            <span class="text-[#9c9a98]">Blocked on this page:</span>
            <span id="shield-stat-count" class="font-mono font-bold text-[#f85e2a] text-sm">0</span>
            <span class="text-[10px] text-[#696766]">(ads, trackers & video interruptions)</span>
          </div>
          <div class="flex items-center gap-2 text-[10px] text-[#858280]">
            <span>Engine: <strong class="text-[#cfcdcc]">Brave adblock-rust</strong></span>
            <span class="px-1.5 py-0.5 rounded bg-[#252525] text-[#b5b3b1] font-mono text-[9px]">MPL-2.0</span>
          </div>
        </div>
      </div>
    </div>
  `;

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
  const tray = container.querySelector("#yoonspace-shields-tray") as HTMLElement | null;
  if (shieldBtn && shieldBadge && shieldIcon && tray) {
    const shieldController = initShieldUI(shieldBtn, shieldBadge, shieldIcon, tray, onShieldToggle);
    (container as TitlebarElement).shieldController = shieldController;
  }

  return container as TitlebarElement;
}
