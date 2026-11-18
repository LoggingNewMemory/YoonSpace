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
import type { AppConfig } from "../types";

export interface SettingsPageController {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  isOpen: () => boolean;
  refreshCacheSize: () => Promise<void>;
}

export function createSettingsPage(
  config: AppConfig,
  onConfigUpdated: (newConfig: AppConfig) => void,
  onBack: () => void
): SettingsPageController {
  const container = document.createElement("div");
  container.id = "settings-page";
  container.className =
    "hidden w-full max-w-4xl mx-auto flex-1 flex flex-col py-8 px-6 text-[#e5e2e1] gap-8 select-none";

  let currentEngineId = config.active_search_engine;

  container.innerHTML = `
    <!-- Page Header -->
    <div class="flex items-center justify-between pb-5 border-b border-[#26262b]">
      <div class="flex items-center gap-4">
        <button
          type="button"
          id="btn-settings-back"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c20] hover:bg-[#28282e] text-[#e2bfb4] hover:text-[#e5e2e1] border border-[#2e2e34] hover:border-[#42424b] text-xs font-semibold transition-all cursor-pointer shadow-sm group"
          title="Go back"
        >
          <span class="material-symbols-outlined text-base group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span>Back</span>
        </button>

        <div class="h-6 w-px bg-[#26262b]"></div>

        <div>
          <h1 class="text-2xl font-bold tracking-tight text-[#e5e2e1] flex items-center gap-2.5">
            <span class="text-[#f85e2a]">Settings</span>
          </h1>
          <p class="text-xs text-[#a09e9d] mt-0.5">Preferences, high-performance caching, and security</p>
        </div>
      </div>

      <div class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#19191c] border border-[#28282d] text-xs text-[#8e8d91]">
        <span class="w-2 h-2 rounded-full bg-[#f85e2a]"></span>
        <span>WebKitGTK 2.34+</span>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex flex-col gap-8 pb-16">
      <!-- 1. Browser Cache & Storage Section -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">cached</span>
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">Browser Cache & Storage</h2>
            <p class="text-xs text-[#a09e9d]">High-performance persistent disk cache and back/forward navigation memory</p>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Page Assets & Resource Cache</div>
              <p class="text-xs text-[#a09e9d] mt-1 leading-relaxed">
                YoonSpace caches images, stylesheets, scripts, and documents locally so websites load sub-second without re-downloading existing resources. BFCache (Page Back/Forward Cache) is enabled.
              </p>
            </div>

            <div class="flex flex-col items-start sm:items-end gap-1 shrink-0">
              <span class="text-[11px] text-[#8e8d91] uppercase tracking-wider">Disk Usage</span>
              <div
                id="settings-page-cache-size"
                class="px-3.5 py-1.5 rounded-xl bg-[#222227] border border-[#34343d] text-sm font-mono font-bold text-[#ffb59e] shadow-inner"
              >
                Calculating...
              </div>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-[#232328]">
            <div id="settings-cache-feedback" class="text-xs text-[#8e8d91] flex items-center gap-1.5">
              <span class="material-symbols-outlined text-sm text-[#71d98d]">check_circle</span>
              <span>Cache active and persisting across sessions.</span>
            </div>

            <button
              type="button"
              id="btn-settings-clear-cache"
              class="px-4 py-2 rounded-xl bg-[#25252b] hover:bg-[#93000a]/50 text-[#ffb4ab] border border-[#383842] hover:border-[#ff5449] text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              <span class="material-symbols-outlined text-base">delete_sweep</span>
              <span id="btn-settings-clear-cache-label">Clear Browser Cache</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 2. Default Search Engine Section -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">search</span>
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">Default Search Engine</h2>
            <p class="text-xs text-[#a09e9d]">Choose the search provider used when typing queries in the omnibar</p>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-3.5 shadow-sm">
          <div id="settings-page-engine-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            <!-- Populated dynamically -->
          </div>
        </div>
      </section>
    </div>
  `;

  const backBtn = container.querySelector("#btn-settings-back") as HTMLElement;
  const clearCacheBtn = container.querySelector("#btn-settings-clear-cache") as HTMLButtonElement;
  const clearCacheLabel = container.querySelector("#btn-settings-clear-cache-label") as HTMLElement;
  const cacheSizeEl = container.querySelector("#settings-page-cache-size") as HTMLElement;
  const cacheFeedback = container.querySelector("#settings-cache-feedback") as HTMLElement;
  const engineListEl = container.querySelector("#settings-page-engine-list") as HTMLElement;

  function renderSearchEngines() {
    engineListEl.innerHTML = "";
    config.search_engines.forEach((engine) => {
      const isSelected = engine.id === currentEngineId;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
        isSelected
          ? "border-[#f85e2a] bg-[#f85e2a]/15 text-[#ffb59e] font-semibold shadow-sm"
          : "border-[#2e2e34] bg-[#222227] hover:bg-[#28282e] text-[#e5e2e1]"
      }`;
      btn.innerHTML = `
        <div class="flex items-center gap-2.5 truncate">
          <span class="material-symbols-outlined text-lg ${
            isSelected ? "text-[#f85e2a]" : "text-[#a09e9d]"
          }">${engine.icon || "search"}</span>
          <span class="font-medium truncate">${engine.name}</span>
        </div>
        ${
          isSelected
            ? '<span class="material-symbols-outlined text-[#f85e2a] text-base shrink-0">check_circle</span>'
            : ""
        }
      `;
      btn.addEventListener("click", async () => {
        currentEngineId = engine.id;
        config.active_search_engine = engine.id;
        try {
          await tauriIpc.updateAppConfig(config);
          onConfigUpdated(config);
        } catch (e) {
          console.error("Failed to save search engine setting:", e);
        }
        renderSearchEngines();
      });
      engineListEl.appendChild(btn);
    });
  }

  async function refreshCacheSize() {
    try {
      cacheSizeEl.textContent = "Calculating...";
      const info = await tauriIpc.getCacheInfo();
      cacheSizeEl.textContent = info.formatted_size;
    } catch {
      cacheSizeEl.textContent = "0 B";
    }
  }

  async function handleClearCache() {
    clearCacheBtn.disabled = true;
    clearCacheLabel.textContent = "Clearing...";
    cacheFeedback.innerHTML = `
      <span class="material-symbols-outlined text-sm text-[#f85e2a] animate-spin">refresh</span>
      <span class="text-[#ffb59e]">Purging memory and WebKit disk cache...</span>
    `;

    try {
      const res = await tauriIpc.clearBrowserCache();
      cacheSizeEl.textContent = res.formatted_size;
      cacheFeedback.innerHTML = `
        <span class="material-symbols-outlined text-sm text-[#71d98d]">done_all</span>
        <span class="text-[#71d98d] font-semibold">Cache cleared successfully!</span>
      `;
      setTimeout(() => {
        cacheFeedback.innerHTML = `
          <span class="material-symbols-outlined text-sm text-[#71d98d]">check_circle</span>
          <span>Cache active and persisting across sessions.</span>
        `;
      }, 3000);
    } catch (e) {
      console.error("Failed to clear cache:", e);
      cacheFeedback.innerHTML = `
        <span class="material-symbols-outlined text-sm text-[#ff5449]">error</span>
        <span class="text-[#ff5449]">Error clearing cache</span>
      `;
    } finally {
      clearCacheBtn.disabled = false;
      clearCacheLabel.textContent = "Clear Browser Cache";
    }
  }

  clearCacheBtn.addEventListener("click", handleClearCache);
  backBtn.addEventListener("click", onBack);

  function show() {
    renderSearchEngines();
    refreshCacheSize();
    container.classList.remove("hidden");
  }

  function hide() {
    container.classList.add("hidden");
  }

  return {
    element: container,
    show,
    hide,
    isOpen: () => !container.classList.contains("hidden"),
    refreshCacheSize,
  };
}
