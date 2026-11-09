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

import type { AppConfig } from "../types";

export function createWelcomeScreen(
  config: AppConfig,
  onSearch: (query: string, engineId: string) => void,
  onSelectEngine: (engineId: string) => void
) {
  const container = document.createElement("div");
  container.className = "w-full max-w-3xl flex flex-col items-center gap-6 mx-auto";

  let activeEngine = config.active_search_engine;

  container.innerHTML = `
    <!-- Hero Section -->
    <section class="flex flex-col items-center text-center">
      <div class="inline-flex items-center justify-center p-3 rounded-2xl bg-[#2a2a2a] shadow-lg mb-3 border border-[#353535]">
        <span class="material-symbols-outlined text-[40px] text-[#ffb59e]">terminal</span>
      </div>
      <h1 class="text-4xl font-extrabold tracking-tight text-[#e5e2e1]">
        Welcome to <span class="text-[#f85e2a]">YoonSpace</span>
      </h1>
      <p class="text-sm text-[#e2bfb4] mt-2 tracking-wide font-mono">
        A browser for Engineers
      </p>
    </section>

    <!-- Engineer Omni Command Input -->
    <section class="w-full flex flex-col items-center">
      <div class="w-full flex flex-col gap-3">
        <form id="omni-search-form" class="w-full">
          <div class="relative w-full rounded-xl bg-[#2a2a2a] p-1.5 shadow-xl border border-[#353535] focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all">
            <div class="flex items-center gap-2.5 px-3 py-1.5">
              <span class="flex items-center justify-center text-[#ffb59e] font-mono text-base font-bold select-none pr-1">
                &gt;
              </span>
              <input
                id="engineerOmniInput"
                class="flex-1 bg-transparent font-mono text-sm text-[#e5e2e1] placeholder-[#aa8a80] outline-none border-none focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
                placeholder="Search the World..."
                type="text"
                autocomplete="off"
              />
              <div class="hidden sm:flex items-center gap-1 bg-[#0e0e0e] px-2 py-1 rounded text-[#aa8a80] font-mono text-[11px] shadow-inner border border-[#353535]">
                <span class="text-[#e5e2e1] font-bold">ENTER</span>
              </div>
            </div>
          </div>
        </form>

        <!-- Search Engine Chips -->
        <div id="search-engine-chips" class="flex items-center justify-center gap-2 flex-wrap pt-1 select-none">
          ${config.search_engines
            .map((engine) => {
              const isActive = engine.id === activeEngine;
              return `
              <button
                type="button"
                data-engine-id="${engine.id}"
                class="engine-chip px-3 py-1 rounded-full text-xs font-mono font-medium flex items-center gap-1.5 transition-all ${
                  isActive
                    ? "bg-[#f85e2a] text-[#521300] shadow-sm font-semibold"
                    : "bg-[#202020] text-[#e2bfb4] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] border border-[#353535]/50"
                }"
              >
                <span class="material-symbols-outlined text-[14px]">${engine.icon}</span>
                <span>${engine.name}</span>
              </button>
            `;
            })
            .join("")}
          
          <button
            id="btn-add-engine"
            type="button"
            title="Configure or add custom search engine"
            class="px-3 py-1 rounded-full bg-[#202020]/60 hover:bg-[#202020] text-[#aa8a80] hover:text-[#e5e2e1] font-mono text-xs flex items-center gap-1 transition-all border border-dashed border-[#5a4139]"
          >
            <span class="material-symbols-outlined text-[14px]">add</span>
            <span>Add Search Engine</span>
          </button>
        </div>
      </div>
    </section>
  `;

  // Engine selection handling
  container.querySelectorAll(".engine-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const engineId = btn.getAttribute("data-engine-id")!;
      activeEngine = engineId;

      container.querySelectorAll(".engine-chip").forEach((b) => {
        b.className =
          "engine-chip px-3 py-1 rounded-full text-xs font-mono font-medium flex items-center gap-1.5 transition-all bg-[#202020] text-[#e2bfb4] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] border border-[#353535]/50";
      });

      btn.className =
        "engine-chip px-3 py-1 rounded-full text-xs font-mono font-semibold flex items-center gap-1.5 transition-all bg-[#f85e2a] text-[#521300] shadow-sm";

      onSelectEngine(engineId);
    });
  });

  // Search submission
  const form = container.querySelector("#omni-search-form") as HTMLFormElement;
  const input = container.querySelector("#engineerOmniInput") as HTMLInputElement;

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      onSearch(query, activeEngine);
    }
  });

  return container;
}
