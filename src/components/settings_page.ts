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
import type {
  AppConfig,
  CacheClearScope,
  CacheInfo,
  StorageCategoryInfo,
  WallpaperOrder,
} from "../types";

export interface SettingsPageController {
  element: HTMLElement;
  show: () => void;
  hide: (onHidden?: () => void, immediate?: boolean) => void;
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
    "hidden w-full max-w-4xl mx-auto flex-1 flex flex-col py-8 px-6 text-[#e5e2e1] gap-8 select-none transition-opacity duration-200 ease-in-out opacity-0";

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
      <!-- 0. Wallpaper Section -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
              <span class="material-symbols-outlined text-lg">wallpaper</span>
            </div>
            <div>
              <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">Wallpaper</h2>
            </div>
          </div>

          <span
            id="settings-wallpaper-count"
            class="hidden px-2.5 py-1 rounded-lg bg-[#222227] border border-[#34343d] text-[11px] font-mono text-[#a09e9d]"
          ></span>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <!-- Wallpaper Folder -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl min-w-0">
              <div class="text-sm font-semibold text-[#e5e2e1]">Wallpaper Folder</div>
              <p class="text-xs text-[#a09e9d] mt-1">
                Select a local folder containing images to display as your homepage background.
              </p>
              <div class="mt-2">
                <span id="settings-wallpaper-path" class="px-3 py-1.5 rounded-xl bg-[#202025] border border-[#2c2c34] text-xs font-mono text-[#ffb59e] select-all inline-block truncate max-w-full">
                  No folder selected
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                id="btn-settings-clear-wallpaper-dir"
                class="hidden px-3 py-1.5 rounded-xl bg-[#25252b] hover:bg-[#93000a]/40 text-[#e2bfb4] hover:text-[#ffb4ab] border border-[#34343e] hover:border-[#ff5449] text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Remove wallpaper"
              >
                <span class="material-symbols-outlined text-base">close</span>
                <span>Clear</span>
              </button>

              <button
                type="button"
                id="btn-settings-select-wallpaper-dir"
                class="px-3 py-1.5 rounded-xl bg-[#f85e2a] hover:bg-[#ff7d47] text-[#521300] hover:text-black font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Select folder containing wallpaper images"
              >
                <span class="material-symbols-outlined text-base">folder_open</span>
                <span>Select Folder</span>
              </button>
            </div>
          </div>

          <div class="w-full h-px bg-[#232328]"></div>

          <!-- Image Order Dropdown -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Image Order</div>
              <p class="text-xs text-[#a09e9d] mt-1">
                Choose how images from the selected folder are ordered.
              </p>
            </div>

            <div class="relative shrink-0" id="settings-wallpaper-order-dropdown">
              <button
                type="button"
                id="settings-wallpaper-order-btn"
                aria-haspopup="listbox"
                aria-expanded="false"
                class="min-w-[148px] px-3 py-2 rounded-xl bg-[#222227] hover:bg-[#2a2a30] border border-[#34343d] hover:border-[#464652] text-xs font-semibold text-[#e5e2e1] flex items-center justify-between gap-2 cursor-pointer transition-colors"
              >
                <span id="settings-wallpaper-order-label">Randomized</span>
                <span class="material-symbols-outlined text-base text-[#a09e9d]">expand_more</span>
              </button>
              <div
                id="settings-wallpaper-order-menu"
                role="listbox"
                class="hidden absolute right-0 mt-1.5 w-full min-w-[148px] rounded-xl bg-[#222227] border border-[#34343d] shadow-xl py-1 z-30 overflow-hidden"
              >
                <button type="button" data-order="a_z" class="wallpaper-order-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>A-Z</span>
                </button>
                <button type="button" data-order="z_a" class="wallpaper-order-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>Z-A</span>
                </button>
                <button type="button" data-order="randomized" class="wallpaper-order-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>Randomized</span>
                </button>
              </div>
            </div>
          </div>

          <div class="w-full h-px bg-[#232328]"></div>

          <!-- Change Every Timer Dropdown -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Change Every</div>
              <p class="text-xs text-[#a09e9d] mt-1">
                Automatically switch to the next wallpaper on a schedule.
              </p>
            </div>

            <div class="relative shrink-0" id="settings-wallpaper-interval-dropdown">
              <button
                type="button"
                id="settings-wallpaper-interval-btn"
                aria-haspopup="listbox"
                aria-expanded="false"
                class="min-w-[148px] px-3 py-2 rounded-xl bg-[#222227] hover:bg-[#2a2a30] border border-[#34343d] hover:border-[#464652] text-xs font-semibold text-[#e5e2e1] flex items-center justify-between gap-2 cursor-pointer transition-colors"
              >
                <span id="settings-wallpaper-interval-label">5 minutes</span>
                <span class="material-symbols-outlined text-base text-[#a09e9d]">expand_more</span>
              </button>
              <div
                id="settings-wallpaper-interval-menu"
                role="listbox"
                class="hidden absolute right-0 mt-1.5 w-full min-w-[148px] rounded-xl bg-[#222227] border border-[#34343d] shadow-xl py-1 z-30 overflow-hidden"
              >
                <button type="button" data-interval="60" class="wallpaper-interval-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>1 minute</span>
                </button>
                <button type="button" data-interval="300" class="wallpaper-interval-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>5 minutes</span>
                </button>
                <button type="button" data-interval="1800" class="wallpaper-interval-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>30 minutes</span>
                </button>
                <button type="button" data-interval="3600" class="wallpaper-interval-opt w-full px-3 py-2 text-left text-xs text-[#e5e2e1] hover:bg-[#2e2e36] flex items-center justify-between cursor-pointer transition-colors">
                  <span>1 hour</span>
                </button>
              </div>
            </div>
          </div>

          <div class="w-full h-px bg-[#232328]"></div>

          <!-- Transparency Slider -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Transparency</div>
              <p class="text-xs text-[#a09e9d] mt-1">
                Adjust homepage wallpaper transparency (0% = solid, 100% = fully transparent).
              </p>
            </div>

            <div class="flex items-center gap-3 shrink-0 min-w-[220px]">
              <input
                type="range"
                id="settings-wallpaper-transparency"
                min="0"
                max="100"
                step="1"
                value="50"
                class="w-36 accent-[#f85e2a] cursor-pointer"
              />
              <span
                id="settings-wallpaper-transparency-value"
                class="px-2.5 py-1 rounded-lg bg-[#222227] border border-[#34343d] text-xs font-mono font-bold text-[#ffb59e] min-w-[52px] text-center"
              >
                50%
              </span>
            </div>
          </div>
        </div>
      </section>

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

          <div id="settings-cache-disk-usage" class="flex items-center gap-2 text-xs shrink-0">
            <span class="text-[#8e8d91] uppercase tracking-wider text-[11px] font-medium whitespace-nowrap">Total Usage</span>
            <span
              id="settings-page-cache-size"
              class="min-w-[96px] text-center px-2.5 py-1 rounded-lg bg-[#222227] border border-[#34343d] text-xs font-mono font-bold tabular-nums whitespace-nowrap text-[#ffb59e] shadow-inner"
            >
              ...
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

  // Local Wallpaper Elements
  const wallpaperPathEl = container.querySelector("#settings-wallpaper-path") as HTMLElement;
  const wallpaperCountEl = container.querySelector("#settings-wallpaper-count") as HTMLElement;
  const btnSelectWallpaperDir = container.querySelector("#btn-settings-select-wallpaper-dir") as HTMLButtonElement;
  const btnClearWallpaperDir = container.querySelector("#btn-settings-clear-wallpaper-dir") as HTMLButtonElement;
  const wallpaperOrderDropdown = container.querySelector("#settings-wallpaper-order-dropdown") as HTMLElement;
  const wallpaperOrderBtn = container.querySelector("#settings-wallpaper-order-btn") as HTMLButtonElement;
  const wallpaperOrderLabel = container.querySelector("#settings-wallpaper-order-label") as HTMLElement;
  const wallpaperOrderMenu = container.querySelector("#settings-wallpaper-order-menu") as HTMLElement;
  const wallpaperIntervalDropdown = container.querySelector("#settings-wallpaper-interval-dropdown") as HTMLElement;
  const wallpaperIntervalBtn = container.querySelector("#settings-wallpaper-interval-btn") as HTMLButtonElement;
  const wallpaperIntervalLabel = container.querySelector("#settings-wallpaper-interval-label") as HTMLElement;
  const wallpaperIntervalMenu = container.querySelector("#settings-wallpaper-interval-menu") as HTMLElement;
  const wallpaperTransparencyInput = container.querySelector("#settings-wallpaper-transparency") as HTMLInputElement;
  const wallpaperTransparencyValueEl = container.querySelector("#settings-wallpaper-transparency-value") as HTMLElement;

  // Download Settings Elements
  const downloadPathEl = container.querySelector("#settings-download-path") as HTMLElement;
  const btnOpenDownloadDir = container.querySelector("#btn-settings-open-download-dir") as HTMLButtonElement;
  const btnChangeDownloadDir = container.querySelector("#btn-settings-change-download-dir") as HTMLButtonElement;
  const optOpenCompleteInput = container.querySelector("#settings-opt-open-complete") as HTMLInputElement;

  const ORDER_LABELS: Record<WallpaperOrder, string> = {
    a_z: "A-Z",
    z_a: "Z-A",
    randomized: "Randomized",
  };

  function renderWallpaperOrder(order: WallpaperOrder) {
    if (wallpaperOrderLabel) {
      wallpaperOrderLabel.textContent = ORDER_LABELS[order];
    }
    wallpaperOrderMenu?.querySelectorAll(".wallpaper-order-opt").forEach((optEl) => {
      const optVal = optEl.getAttribute("data-order");
      const isActive = optVal === order;
      optEl.className = `wallpaper-order-opt w-full px-3 py-2 text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
        isActive
          ? "bg-[#f85e2a]/15 text-[#ffb59e] font-semibold"
          : "text-[#e5e2e1] hover:bg-[#2e2e36]"
      }`;
      const existingCheck = optEl.querySelector(".order-check");
      if (isActive && !existingCheck) {
        const icon = document.createElement("span");
        icon.className = "order-check material-symbols-outlined text-sm text-[#f85e2a]";
        icon.textContent = "check";
        optEl.appendChild(icon);
      } else if (!isActive && existingCheck) {
        existingCheck.remove();
      }
    });
  }

  const INTERVAL_LABELS: Record<number, string> = {
    60: "1 minute",
    300: "5 minutes",
    1800: "30 minutes",
    3600: "1 hour",
  };

  function renderWallpaperInterval(secs: number) {
    const normalized = secs in INTERVAL_LABELS ? secs : 300;
    if (wallpaperIntervalLabel) {
      wallpaperIntervalLabel.textContent = INTERVAL_LABELS[normalized];
    }
    wallpaperIntervalMenu?.querySelectorAll(".wallpaper-interval-opt").forEach((optEl) => {
      const optVal = Number(optEl.getAttribute("data-interval"));
      const isActive = optVal === normalized;
      optEl.className = `wallpaper-interval-opt w-full px-3 py-2 text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
        isActive
          ? "bg-[#f85e2a]/15 text-[#ffb59e] font-semibold"
          : "text-[#e5e2e1] hover:bg-[#2e2e36]"
      }`;
      const existingCheck = optEl.querySelector(".interval-check");
      if (isActive && !existingCheck) {
        const icon = document.createElement("span");
        icon.className = "interval-check material-symbols-outlined text-sm text-[#f85e2a]";
        icon.textContent = "check";
        optEl.appendChild(icon);
      } else if (!isActive && existingCheck) {
        existingCheck.remove();
      }
    });
  }

  async function renderWallpaperSettings() {
    const ws = config.wallpaper_settings ?? {
      folder_path: "",
      transparency: 50,
      order: "randomized" as WallpaperOrder,
      change_interval_secs: 0,
    };
    const folder = ws.folder_path?.trim() || "";
    const transparency = Math.max(0, Math.min(100, Math.round(ws.transparency ?? 50)));
    const order: WallpaperOrder =
      ws.order === "a_z" || ws.order === "z_a" || ws.order === "randomized"
        ? ws.order
        : "randomized";
    const intervalSecs = typeof ws.change_interval_secs === "number" ? ws.change_interval_secs : 300;

    renderWallpaperOrder(order);
    renderWallpaperInterval(intervalSecs);
    if (wallpaperTransparencyInput) {
      wallpaperTransparencyInput.value = String(transparency);
    }
    if (wallpaperTransparencyValueEl) {
      wallpaperTransparencyValueEl.textContent = `${transparency}%`;
    }

    if (folder) {
      wallpaperPathEl.textContent = folder;
      wallpaperPathEl.title = folder;
      btnClearWallpaperDir.classList.remove("hidden");
      try {
        const images = await tauriIpc.listWallpaperImages(folder);
        wallpaperCountEl.textContent =
          images.length === 1 ? "1 image found" : `${images.length} images found`;
        wallpaperCountEl.classList.remove("hidden");
      } catch {
        wallpaperCountEl.classList.add("hidden");
      }
    } else {
      wallpaperPathEl.textContent = "No folder selected";
      wallpaperPathEl.title = "";
      btnClearWallpaperDir.classList.add("hidden");
      wallpaperCountEl.classList.add("hidden");
    }
  }

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

      const nameSpan = document.createElement("span");
      nameSpan.className = "font-medium truncate";
      nameSpan.textContent = engine.name;
      btn.appendChild(nameSpan);

      if (isSelected) {
        const checkIcon = document.createElement("span");
        checkIcon.className = "material-symbols-outlined text-[#f85e2a] text-base shrink-0 ml-2";
        checkIcon.textContent = "check_circle";
        btn.appendChild(checkIcon);
      }

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

  // Local Wallpaper Event Listeners
  btnSelectWallpaperDir?.addEventListener("click", async () => {
    const chosen = await tauriIpc.selectWallpaperDir();
    if (chosen) {
      if (!config.wallpaper_settings) {
        config.wallpaper_settings = {
          folder_path: chosen,
          transparency: 50,
        };
      } else {
        config.wallpaper_settings.folder_path = chosen;
      }
      await renderWallpaperSettings();
      await tauriIpc.updateAppConfig(config);
      onConfigUpdated(config);
    }
  });

  btnClearWallpaperDir?.addEventListener("click", async () => {
    if (!config.wallpaper_settings) {
      config.wallpaper_settings = { folder_path: "", transparency: 50 };
    } else {
      config.wallpaper_settings.folder_path = "";
    }
    await renderWallpaperSettings();
    await tauriIpc.updateAppConfig(config);
    onConfigUpdated(config);
  });

  wallpaperOrderBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = wallpaperOrderMenu.classList.contains("hidden");
    wallpaperOrderMenu.classList.toggle("hidden", !isHidden);
    wallpaperOrderBtn.setAttribute("aria-expanded", String(isHidden));
  });

  wallpaperOrderMenu?.querySelectorAll(".wallpaper-order-opt").forEach((optEl) => {
    optEl.addEventListener("click", async () => {
      const order = (optEl.getAttribute("data-order") || "randomized") as WallpaperOrder;
      wallpaperOrderMenu.classList.add("hidden");
      wallpaperOrderBtn.setAttribute("aria-expanded", "false");
      if (!config.wallpaper_settings) {
        config.wallpaper_settings = { folder_path: "", transparency: 50, order };
      } else {
        config.wallpaper_settings.order = order;
      }
      renderWallpaperOrder(order);
      await tauriIpc.updateAppConfig(config);
      onConfigUpdated(config);
    });
  });

  wallpaperIntervalBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = wallpaperIntervalMenu.classList.contains("hidden");
    wallpaperIntervalMenu.classList.toggle("hidden", !isHidden);
    wallpaperIntervalBtn.setAttribute("aria-expanded", String(isHidden));
  });

  wallpaperIntervalMenu?.querySelectorAll(".wallpaper-interval-opt").forEach((optEl) => {
    optEl.addEventListener("click", async () => {
      const secs = Number(optEl.getAttribute("data-interval")) || 0;
      wallpaperIntervalMenu.classList.add("hidden");
      wallpaperIntervalBtn.setAttribute("aria-expanded", "false");
      if (!config.wallpaper_settings) {
        config.wallpaper_settings = {
          folder_path: "",
          transparency: 50,
          order: "randomized",
          change_interval_secs: secs,
        };
      } else {
        config.wallpaper_settings.change_interval_secs = secs;
      }
      renderWallpaperInterval(secs);
      await tauriIpc.updateAppConfig(config);
      onConfigUpdated(config);
    });
  });

  document.addEventListener("click", (e) => {
    if (wallpaperOrderDropdown && !wallpaperOrderDropdown.contains(e.target as Node)) {
      wallpaperOrderMenu?.classList.add("hidden");
      wallpaperOrderBtn?.setAttribute("aria-expanded", "false");
    }
    if (wallpaperIntervalDropdown && !wallpaperIntervalDropdown.contains(e.target as Node)) {
      wallpaperIntervalMenu?.classList.add("hidden");
      wallpaperIntervalBtn?.setAttribute("aria-expanded", "false");
    }
  });

  wallpaperTransparencyInput?.addEventListener("input", () => {
    const val = Math.max(0, Math.min(100, Number(wallpaperTransparencyInput.value) || 0));
    if (wallpaperTransparencyValueEl) {
      wallpaperTransparencyValueEl.textContent = `${val}%`;
    }
    if (!config.wallpaper_settings) {
      config.wallpaper_settings = { folder_path: "", transparency: val };
    } else {
      config.wallpaper_settings.transparency = val;
    }
  });

  wallpaperTransparencyInput?.addEventListener("change", async () => {
    const val = Math.max(0, Math.min(100, Number(wallpaperTransparencyInput.value) || 0));
    if (!config.wallpaper_settings) {
      config.wallpaper_settings = { folder_path: "", transparency: val };
    } else {
      config.wallpaper_settings.transparency = val;
    }
    await tauriIpc.updateAppConfig(config);
    onConfigUpdated(config);
  });

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

  // Pre-populate Settings sections in the background shortly after startup
  // so opening Settings the first time has zero layout/text shift.
  window.setTimeout(() => {
    renderSearchEngines();
    renderDownloadSettings();
    void renderWallpaperSettings();
    void refreshCacheSize();
    void refreshVault();
  }, 250);

  let hideTimer: number | null = null;
  let refreshTimer: number | null = null;
  let isVisibleState = false;

  function cancelTimers() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function show() {
    cancelTimers();
    isVisibleState = true;

    renderSearchEngines();
    renderDownloadSettings();
    void renderWallpaperSettings();
    cacheFeedback.classList.add("hidden");
    cacheFeedback.innerHTML = "";
    cacheNote.classList.remove("hidden");

    container.classList.remove("hidden", "pointer-events-none", "opacity-100");
    container.classList.add("opacity-0");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!isVisibleState) return;
        container.classList.remove("opacity-0");
        container.classList.add("opacity-100");
      });
    });

    // Defer disk/IPC-heavy refreshes until the 150ms GPU-composited transition completes
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (!isVisibleState) return;
      void renderWallpaperSettings();
      void refreshCacheSize();
      void refreshVault();
      tauriIpc
        .getAppConfig()
        .then((fresh) => {
          if (fresh && isVisibleState) {
            Object.assign(config, fresh);
            currentEngineId = fresh.active_search_engine;
            renderSearchEngines();
            renderDownloadSettings();
            void renderWallpaperSettings();
          }
        })
        .catch(() => {});
    }, 160);
  }

  function hide(onHidden?: () => void, immediate = false) {
    cancelTimers();
    isVisibleState = false;

    if (immediate || container.classList.contains("hidden")) {
      container.classList.add("hidden", "opacity-0");
      container.classList.remove("opacity-100", "pointer-events-none");
      onHidden?.();
      return;
    }

    container.classList.remove("opacity-100");
    container.classList.add("opacity-0", "pointer-events-none");
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (isVisibleState) return;
      container.classList.add("hidden");
      container.classList.remove("pointer-events-none");
      onHidden?.();
    }, 200);
  }

  return {
    element: container,
    show,
    hide,
    isOpen: () => isVisibleState,
    refreshCacheSize,
    refreshVault,
  };
}
