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

export function createTitlebar(onNavigate: (url: string) => void, onHomeClick: () => void) {
  const container = document.createElement("header");
  container.className =
    "fixed top-0 left-0 right-0 z-50 flex flex-col bg-[#0e0e0e]/95 backdrop-blur-xl border-b border-[#202020] shadow-[0_1px_8px_rgba(0,0,0,0.4)]";

  container.innerHTML = `
    <!-- Window Drag Title Row -->
    <div id="titlebar-drag-strip" data-tauri-drag-region class="h-8 pl-3 pr-1.5 flex items-center justify-between select-none cursor-default drag-region">
      <div class="flex items-center gap-2 pointer-events-none">
        <span class="flex items-center gap-2 font-mono text-xs text-[#e2bfb4]">
          <img src="/logo.png" alt="YoonSpace" class="w-4 h-4 object-contain bg-transparent" />
          <span class="font-semibold text-[#e5e2e1] tracking-wide">YoonSpace</span>
        </span>
        <div class="h-3 w-px bg-[#353535] mx-1"></div>
        <span id="telemetry-badge" class="pointer-events-auto inline-flex items-center px-2 py-0.5 rounded bg-[#202020] font-mono text-[11px] text-[#ffb59e] border border-[#353535]/50 hover:border-[#f85e2a]/50 transition-colors cursor-help">
          <span id="telemetry-ram">42 MB RAM</span>
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
      <div id="split-active-indicator" class="hidden absolute left-4 items-center gap-1.5 px-2 py-0.5 rounded bg-[#f85e2a]/20 border border-[#f85e2a]/40 text-[#ffb59e] font-mono text-[11px]">
        <span class="material-symbols-outlined text-[14px]">splitscreen</span>
        <span>Dual Split Active</span>
        <button id="btn-close-split" class="ml-1 hover:text-white cursor-pointer" title="Close Split View">
          <span class="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>

      <div class="w-full max-w-2xl mx-auto -translate-y-0.5">
        <form id="global-omnibar-form" class="w-full">
          <div class="w-full h-8 px-3 bg-[#202020] rounded-lg flex items-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] border border-transparent focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all">
            <input
              id="global-omnibar-input"
              class="w-full bg-transparent border-0 outline-none font-mono text-xs text-[#e5e2e1] placeholder-[#ADABAA] focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
              placeholder="Search or enter address..."
              type="text"
              autocomplete="off"
            />
          </div>
        </form>
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

  return container;
}
