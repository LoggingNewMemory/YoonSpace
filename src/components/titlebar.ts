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
    <div data-tauri-drag-region class="h-8 px-3 flex items-center justify-between select-none drag-region">
      <div class="flex items-center gap-2 no-drag">
        <span class="flex items-center gap-1.5 font-mono text-xs text-[#e2bfb4]">
          <span class="material-symbols-outlined text-[15px] text-[#f85e2a]">terminal</span>
          <span class="font-semibold text-[#e5e2e1] tracking-wide">YoonSpace</span>
        </span>
        <div class="h-3 w-px bg-[#353535] mx-1"></div>
        <span id="telemetry-badge" class="inline-flex items-center px-2 py-0.5 rounded bg-[#202020] font-mono text-[11px] text-[#ffb59e] border border-[#353535]/50">
          <span id="telemetry-dot" class="w-1.5 h-1.5 rounded-full bg-[#f85e2a] mr-1.5 animate-pulse"></span>
          <span id="telemetry-ram">42 MB RAM</span>
        </span>
      </div>

      <div class="flex-1 h-full drag-region" data-tauri-drag-region></div>

      <!-- Window Controls -->
      <div class="flex items-center gap-2 no-drag">
        <button id="btn-win-min" aria-label="Minimize" class="w-3.5 h-3.5 rounded-full bg-[#353535] hover:bg-[#4a4a4a] flex items-center justify-center transition-colors group" type="button">
          <span class="material-symbols-outlined text-[9px] text-[#e2bfb4] group-hover:text-white">minimize</span>
        </button>
        <button id="btn-win-max" aria-label="Maximize" class="w-3.5 h-3.5 rounded-full bg-[#353535] hover:bg-[#4a4a4a] flex items-center justify-center transition-colors group" type="button">
          <span class="material-symbols-outlined text-[9px] text-[#e2bfb4] group-hover:text-white">crop_square</span>
        </button>
        <button id="btn-win-close" aria-label="Close" class="w-3.5 h-3.5 rounded-full bg-[#93000a] hover:bg-[#ba1a1a] flex items-center justify-center transition-colors group" type="button">
          <span class="material-symbols-outlined text-[9px] text-[#ffdad6] group-hover:text-white">close</span>
        </button>
      </div>
    </div>

    <!-- Navigation / Omnibar Row -->
    <div class="h-12 px-4 flex items-center gap-3 bg-[#1b1b1c]/95 border-t border-[#202020]/60 justify-between">
      <div class="flex items-center gap-2">
        <button id="btn-nav-home" title="Welcome Tab" class="p-1.5 rounded-lg text-[#e2bfb4] hover:text-[#e5e2e1] hover:bg-[#202020] transition-colors">
          <span class="material-symbols-outlined text-[18px]">home</span>
        </button>
        <div id="split-active-indicator" class="hidden items-center gap-1.5 px-2 py-0.5 rounded bg-[#f85e2a]/20 border border-[#f85e2a]/40 text-[#ffb59e] font-mono text-[11px]">
          <span class="material-symbols-outlined text-[14px]">splitscreen</span>
          <span>Dual Split Active</span>
          <button id="btn-close-split" class="ml-1 hover:text-white" title="Close Split View">
            <span class="material-symbols-outlined text-[12px]">close</span>
          </button>
        </div>
      </div>

      <div class="flex-1 flex items-center justify-center max-w-2xl mx-auto">
        <form id="global-omnibar-form" class="w-full">
          <div class="w-full h-8 px-3 bg-[#202020] rounded-lg flex items-center gap-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] border border-transparent focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all">
            <span class="material-symbols-outlined text-[16px] text-[#aa8a80]">search</span>
            <input
              id="global-omnibar-input"
              class="flex-1 bg-transparent border-0 outline-none font-mono text-xs text-[#e5e2e1] placeholder-[#aa8a80] focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
              placeholder="Search or enter address..."
              type="text"
              autocomplete="off"
            />
            <span class="font-mono text-[10px] text-[#aa8a80] bg-[#131313] px-1.5 py-0.5 rounded border border-[#353535]">URL</span>
          </div>
        </form>
      </div>

      <div class="w-24 flex items-center justify-end gap-1 text-[#aa8a80]">
        <button id="btn-split-toggle" title="Toggle Split View" class="p-1.5 rounded-lg hover:text-[#e5e2e1] hover:bg-[#202020] transition-colors">
          <span class="material-symbols-outlined text-[18px]">splitscreen</span>
        </button>
      </div>
    </div>
  `;

  // Attach event handlers
  container.querySelector("#btn-win-min")?.addEventListener("click", () => tauriIpc.minimizeWindow());
  container.querySelector("#btn-win-max")?.addEventListener("click", () => tauriIpc.toggleMaximizeWindow());
  container.querySelector("#btn-win-close")?.addEventListener("click", () => tauriIpc.closeWindow());

  container.querySelector("#btn-nav-home")?.addEventListener("click", onHomeClick);

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
