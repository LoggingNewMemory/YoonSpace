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
import type { AppConfig, CacheClearScope, CacheInfo, StorageCategoryInfo } from "../types";

export interface SettingsPageController {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  isOpen: () => boolean;
  refreshCacheSize: () => Promise<void>;
  refreshVault: () => Promise<void>;
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
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex flex-col gap-8 pb-16">
      <!-- 1. Browser Cache & Storage Section -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
              <span class="material-symbols-outlined text-lg">hard_drive</span>
            </div>
            <div>
              <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">Browser Cache & Storage</h2>
            </div>
          </div>

          <div id="settings-cache-disk-usage" class="flex items-center gap-2 text-xs">
            <span class="text-[#8e8d91] uppercase tracking-wider text-[11px] font-medium">Total Usage</span>
            <span
              id="settings-page-cache-size"
              class="px-2.5 py-1 rounded-lg bg-[#222227] border border-[#34343d] text-xs font-mono font-bold text-[#ffb59e] shadow-inner"
            >
              Calculating...
            </span>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <!-- Granular Category Breakdown -->
          <div id="settings-cache-categories" class="flex flex-col divide-y divide-[#232328]">
            <!-- Populated dynamically -->
          </div>

          <!-- Footer Action Bar -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-[#232328]">
            <div class="flex items-center gap-2 min-h-[24px]">
              <div id="settings-cache-feedback" class="hidden text-xs text-[#8e8d91] flex items-center gap-1.5"></div>
              <span id="settings-cache-note" class="text-[11px] text-[#76757a]">
                Clearing cache keeps your saved passwords, vault tokens, and cookies intact.
              </span>
            </div>

            <button
              type="button"
              id="btn-settings-clear-cache"
              class="px-4 py-2 rounded-xl bg-[#25252b] hover:bg-[#93000a]/50 text-[#ffb4ab] border border-[#383842] hover:border-[#ff5449] text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              <span class="material-symbols-outlined text-base">delete_sweep</span>
              <span id="btn-settings-clear-cache-label">Clear All Browsing Cache</span>
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
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-3.5 shadow-sm">
          <div id="settings-page-engine-list" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            <!-- Populated dynamically -->
          </div>
        </div>
      </section>

      <!-- 3. User Data -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">enhanced_encryption</span>
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">User Data</h2>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div class="max-w-xl">
            <div class="text-sm font-semibold text-[#e5e2e1]">Persistent Website Storage (Cookies & Sessions)</div>
            <p class="text-xs text-[#a09e9d] mt-1 leading-relaxed">
              Auth tokens, session state, and website cookies persist locally across browser sessions so you remain logged in across restarts.
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <div class="text-right">
              <span class="text-[10px] text-[#8e8d91] uppercase tracking-wider block">Cookies Size</span>
              <span id="vault-cookies-size" class="text-xs font-mono font-bold text-[#ffb59e]">0 B</span>
            </div>
            <button
              type="button"
              id="btn-clear-cookies"
              class="px-3 py-1.5 rounded-xl bg-[#28282e] hover:bg-[#93000a]/40 text-[#ffb4ab] border border-[#383842] hover:border-[#ff5449] text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
              title="Wipe persistent cookies database"
            >
              <span class="material-symbols-outlined text-sm">cookie_off</span>
              <span>Clear Cookies</span>
            </button>
          </div>
        </div>
      </section>

      <!-- 4. Downloads Section -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
            <span class="material-symbols-outlined text-lg">download</span>
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">Downloads</h2>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <!-- Download Location -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Download Location</div>
              <div class="mt-2">
                <span id="settings-download-path" class="px-3 py-1.5 rounded-xl bg-[#202025] border border-[#2c2c34] text-xs font-mono text-[#ffb59e] select-all inline-block truncate max-w-full">
                  Calculating...
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                id="btn-settings-open-download-dir"
                class="px-3 py-1.5 rounded-xl bg-[#25252b] hover:bg-[#32323a] text-[#e2bfb4] hover:text-[#e5e2e1] border border-[#34343e] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Open download folder in file manager"
              >
                <span class="material-symbols-outlined text-base">folder_open</span>
                <span>Open Folder</span>
              </button>

              <button
                type="button"
                id="btn-settings-change-download-dir"
                class="px-3 py-1.5 rounded-xl bg-[#f85e2a] hover:bg-[#ff7d47] text-[#521300] hover:text-black font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Change default download directory"
              >
                <span class="material-symbols-outlined text-base">drive_file_move</span>
                <span>Change Location</span>
              </button>
            </div>
          </div>

          <div class="w-full h-px bg-[#232328]"></div>

          <!-- Open Folder on Completion Toggle -->
          <label class="flex items-center justify-between cursor-pointer select-none group py-1">
            <div class="flex flex-col pr-4">
              <span class="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors">
                Open folder automatically when download completes
              </span>
            </div>
            <div class="relative inline-flex items-center cursor-pointer shrink-0">
              <input id="settings-opt-open-complete" class="sr-only peer" type="checkbox">
              <div class="w-11 h-6 bg-[#3a3a3e] peer-checked:bg-[#f85e2a] rounded-full transition-colors duration-200 ease-in-out"></div>
              <div class="absolute left-0 top-0 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out translate-x-0 peer-checked:translate-x-5 pointer-events-none"></div>
            </div>
          </label>
        </div>
      </section>
    </div>
  `;

  const backBtn = container.querySelector("#btn-settings-back") as HTMLElement;
  const clearCacheBtn = container.querySelector("#btn-settings-clear-cache") as HTMLButtonElement;
  const clearCacheLabel = container.querySelector("#btn-settings-clear-cache-label") as HTMLElement;
  const cacheSizeEl = container.querySelector("#settings-page-cache-size") as HTMLElement;
  const cacheCategoriesEl = container.querySelector("#settings-cache-categories") as HTMLElement;
  const cacheFeedback = container.querySelector("#settings-cache-feedback") as HTMLElement;
  const cacheNote = container.querySelector("#settings-cache-note") as HTMLElement;
  const engineListEl = container.querySelector("#settings-page-engine-list") as HTMLElement;

  // User Data Elements
  const vaultCookiesSizeEl = container.querySelector("#vault-cookies-size") as HTMLElement;
  const btnClearCookies = container.querySelector("#btn-clear-cookies") as HTMLButtonElement;

  // Download Settings Elements
  const downloadPathEl = container.querySelector("#settings-download-path") as HTMLElement;
  const btnOpenDownloadDir = container.querySelector("#btn-settings-open-download-dir") as HTMLButtonElement;
  const btnChangeDownloadDir = container.querySelector("#btn-settings-change-download-dir") as HTMLButtonElement;
  const optOpenCompleteInput = container.querySelector("#settings-opt-open-complete") as HTMLInputElement;

  function renderDownloadSettings() {
    const ds = config.download_settings;
    if (downloadPathEl) {
      downloadPathEl.textContent = ds?.download_dir || "~/Downloads";
      downloadPathEl.title = ds?.download_dir || "";
    }
    if (optOpenCompleteInput) {
      optOpenCompleteInput.checked = Boolean(ds?.open_folder_on_complete);
    }
  }

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

  const CATEGORY_COLORS: Record<string, string> = {
    http_cache: "#f85e2a",
    site_data: "#60a5fa",
    favicons: "#34d399",
    shield_cache: "#a78bfa",
  };

  function renderCacheInfo(info: CacheInfo) {
    cacheSizeEl.textContent = info.formatted_size;

    cacheCategoriesEl.innerHTML = "";
    const categories: StorageCategoryInfo[] = info.categories || [];
    categories.forEach((cat) => {
      const color = CATEGORY_COLORS[cat.id] || "#a09e9d";
      const row = document.createElement("div");
      row.className = "py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3";

      const left = document.createElement("div");
      left.className = "flex flex-col gap-0.5 min-w-0";
      left.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${color}"></span>
          <span class="text-xs font-semibold text-[#e5e2e1] truncate">${cat.label}</span>
        </div>
        <p class="text-[11px] text-[#8e8d91] pl-4 leading-relaxed">${cat.description}</p>
      `;

      const right = document.createElement("div");
      right.className = "flex items-center gap-2.5 shrink-0 pl-4 sm:pl-0";

      const sizeBadge = document.createElement("span");
      sizeBadge.className = "text-xs font-mono font-bold text-[#ffb59e] min-w-[64px] text-right";
      sizeBadge.textContent = cat.formatted_size;
      right.appendChild(sizeBadge);

      if (cat.clearable) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className =
          "px-2.5 py-1 rounded-lg bg-[#222227] hover:bg-[#93000a]/40 text-[#e2bfb4] hover:text-[#ffb4ab] border border-[#32323a] hover:border-[#ff5449] text-[11px] font-medium transition-all cursor-pointer disabled:opacity-50";
        btn.textContent = cat.id === "http_cache" ? "Clear Cache" : cat.id === "site_data" ? "Clear Site Data" : "Clear Icons";
        btn.disabled = cat.size_bytes === 0;
        btn.addEventListener("click", () => {
          if (
            cat.id === "site_data" &&
            !confirm("Clear all Site Data (IndexedDB, LocalStorage, Service Workers)? Offline web app state will be reset.")
          ) {
            return;
          }
          handleClearCache(cat.id as CacheClearScope, btn);
        });
        right.appendChild(btn);
      } else {
        const badge = document.createElement("span");
        badge.className =
          "px-2 py-1 rounded-lg bg-[#202025] text-[#76757a] border border-[#2c2c34] text-[10px] font-medium";
        badge.textContent = "Managed";
        right.appendChild(badge);
      }

      row.appendChild(left);
      row.appendChild(right);
      cacheCategoriesEl.appendChild(row);
    });
  }

  async function refreshCacheSize() {
    try {
      cacheSizeEl.textContent = "Calculating...";
      const info = await tauriIpc.getCacheInfo();
      renderCacheInfo(info);
    } catch {
      cacheSizeEl.textContent = "0 B";
    }
  }

  async function handleClearCache(scope: CacheClearScope = "all", triggerBtn?: HTMLButtonElement) {
    clearCacheBtn.disabled = true;
    if (triggerBtn) triggerBtn.disabled = true;
    if (scope === "all") {
      clearCacheLabel.textContent = "Clearing...";
    }
    cacheNote.classList.add("hidden");
    cacheFeedback.classList.remove("hidden");
    cacheFeedback.innerHTML = `
      <span class="material-symbols-outlined text-sm text-[#f85e2a] animate-spin">refresh</span>
      <span class="text-[#ffb59e]">Purging ${scope === "all" ? "all browsing cache" : scope.replace("_", " ")}...</span>
    `;

    try {
      const res = await tauriIpc.clearBrowserCache(scope);
      renderCacheInfo(res);
      cacheFeedback.innerHTML = `
        <span class="material-symbols-outlined text-sm text-[#71d98d]">done_all</span>
        <span class="text-[#71d98d] font-semibold">Cleared successfully!</span>
      `;
      setTimeout(() => {
        cacheFeedback.classList.add("hidden");
        cacheFeedback.innerHTML = "";
        cacheNote.classList.remove("hidden");
      }, 3000);
    } catch (e) {
      console.error("Failed to clear cache:", e);
      cacheFeedback.innerHTML = `
        <span class="material-symbols-outlined text-sm text-[#ff5449]">error</span>
        <span class="text-[#ff5449]">Error clearing cache</span>
      `;
    } finally {
      clearCacheBtn.disabled = false;
      clearCacheLabel.textContent = "Clear All Browsing Cache";
    }
  }

  // Persistent Website Storage Stats
  async function refreshVault() {
    try {
      const stats = await tauriIpc.getVaultStats();
      vaultCookiesSizeEl.textContent = stats.cookies_formatted_size;
    } catch (e) {
      console.error("Failed to refresh user data stats:", e);
    }
  }

  btnClearCookies.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear all persistent cookies? You will be logged out of active website accounts.")) {
      return;
    }
    try {
      await tauriIpc.clearPersistentCookies();
      await refreshVault();
    } catch (e) {
      console.error("Failed to clear persistent cookies:", e);
    }
  });

  clearCacheBtn.addEventListener("click", () => handleClearCache("all"));
  backBtn.addEventListener("click", onBack);

  // Download Settings Event Listeners
  btnOpenDownloadDir?.addEventListener("click", async () => {
    await tauriIpc.openDownloadDir(config.download_settings?.download_dir);
  });

  btnChangeDownloadDir?.addEventListener("click", async () => {
    const chosen = await tauriIpc.selectDownloadDir();
    if (chosen) {
      if (!config.download_settings) {
        config.download_settings = {
          download_dir: chosen,
          ask_where_to_save: false,
          open_folder_on_complete: false,
        };
      } else {
        config.download_settings.download_dir = chosen;
      }
      renderDownloadSettings();
      await tauriIpc.updateAppConfig(config);
      onConfigUpdated(config);
    }
  });

  optOpenCompleteInput?.addEventListener("change", async () => {
    if (!config.download_settings) {
      config.download_settings = {
        download_dir: "~/Downloads",
        ask_where_to_save: false,
        open_folder_on_complete: optOpenCompleteInput.checked,
      };
    } else {
      config.download_settings.open_folder_on_complete = optOpenCompleteInput.checked;
    }
    await tauriIpc.updateAppConfig(config);
    onConfigUpdated(config);
  });

  function show() {
    tauriIpc
      .getAppConfig()
      .then((fresh) => {
        if (fresh) {
          Object.assign(config, fresh);
          renderSearchEngines();
          renderDownloadSettings();
        }
      })
      .catch(() => {});
    renderSearchEngines();
    renderDownloadSettings();
    cacheFeedback.classList.add("hidden");
    cacheFeedback.innerHTML = "";
    cacheNote.classList.remove("hidden");
    refreshCacheSize();
    refreshVault();
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
    refreshVault,
  };
}
