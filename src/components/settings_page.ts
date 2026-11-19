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
import type { AppConfig, EngineerToken, SavedCredential } from "../types";

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
  let activeVaultTab: "logins" | "tokens" = "logins";
  let cachedCredentials: SavedCredential[] = [];
  let cachedTokens: EngineerToken[] = [];
  const visibleSecrets = new Set<string>(); // Tracks IDs of currently unmasked passwords/tokens

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
          <p class="text-xs text-[#a09e9d] mt-0.5">Preferences, high-performance caching, and strong local encryption</p>
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

      <!-- 3. User Data & Strong Encryption (AES-256-GCM) -->
      <section class="flex flex-col gap-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center">
              <span class="material-symbols-outlined text-lg">enhanced_encryption</span>
            </div>
            <div>
              <h2 class="text-sm font-bold text-[#e5e2e1] uppercase tracking-wider">User Data & Strong Encryption</h2>
              <p class="text-xs text-[#a09e9d]">Hardware/OS-bound AES-256-GCM encrypted local vault & persistent website storage</p>
            </div>
          </div>

          <div class="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#19191c] border border-[#2b2b33] text-[11px] text-[#71d98d]">
            <span class="material-symbols-outlined text-sm">lock</span>
            <span class="font-semibold">AES-256-GCM Active</span>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-5 shadow-sm">
          <!-- Encryption Specs Banner -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#202025] border border-[#2c2c34] text-xs">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-[#f85e2a] text-lg">shield</span>
              <div>
                <div class="font-semibold text-[#e5e2e1]">Algorithm</div>
                <div class="text-[11px] text-[#a09e9d]">AES-256-GCM (256-bit AEAD)</div>
              </div>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-[#71d98d] text-lg">verified_user</span>
              <div>
                <div class="font-semibold text-[#e5e2e1]">Key Derivation</div>
                <div class="text-[11px] text-[#a09e9d]">Machine ID + POSIX 0600 Root</div>
              </div>
            </div>
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-[#ffb59e] text-lg">fingerprint</span>
              <div>
                <div class="font-semibold text-[#e5e2e1]">Integrity & Auth Tag</div>
                <div class="text-[11px] text-[#a09e9d]">128-bit Poly1305 / GCM Tag</div>
              </div>
            </div>
          </div>

          <!-- A. Persistent Website Storage (Cookies & Sessions) -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#202025]/60 border border-[#2a2a32]">
            <div>
              <div class="text-xs font-semibold text-[#e5e2e1] flex items-center gap-2">
                <span>Persistent Website Storage (Cookies & Sessions)</span>
                <span class="px-2 py-0.5 rounded-full bg-[#f85e2a]/15 text-[#ffb59e] text-[10px] font-mono">SQLite</span>
              </div>
              <p class="text-[11px] text-[#a09e9d] mt-1 max-w-lg leading-relaxed">
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

          <!-- B. Encrypted Vault (Saved Logins & Engineer Tokens) -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <!-- Segmented Control for Vault Tabs -->
                <div class="flex rounded-xl bg-[#202026] p-1 border border-[#2d2d36]">
                  <button
                    type="button"
                    id="vault-tab-logins"
                    class="px-3 py-1 rounded-lg text-xs font-semibold bg-[#2a2a32] text-[#ffb59e] shadow-sm transition-all cursor-pointer"
                  >
                    Saved Logins (<span id="vault-count-logins">0</span>)
                  </button>
                  <button
                    type="button"
                    id="vault-tab-tokens"
                    class="px-3 py-1 rounded-lg text-xs font-medium text-[#a09e9d] hover:text-[#e5e2e1] transition-all cursor-pointer"
                  >
                    Engineer Tokens (<span id="vault-count-tokens">0</span>)
                  </button>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  id="btn-vault-add"
                  class="px-3 py-1.5 rounded-xl bg-[#f85e2a] hover:bg-[#ff7d47] text-[#521300] hover:text-black font-semibold text-xs transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <span class="material-symbols-outlined text-base">add</span>
                  <span id="btn-vault-add-label">Add Login</span>
                </button>
                <button
                  type="button"
                  id="btn-vault-clear"
                  class="px-2.5 py-1.5 rounded-xl bg-[#25252b] hover:bg-[#93000a]/40 text-[#a09e9d] hover:text-[#ffb4ab] border border-[#34343e] text-xs transition-all flex items-center gap-1 cursor-pointer"
                  title="Wipe all encrypted vault entries"
                >
                  <span class="material-symbols-outlined text-sm">lock_reset</span>
                </button>
              </div>
            </div>

            <!-- Inline Add Form (Initially Hidden) -->
            <div id="vault-add-form" class="hidden p-4 rounded-xl bg-[#202027] border border-[#353542] flex flex-col gap-3">
              <!-- Rendered dynamically -->
            </div>

            <!-- Vault List Container -->
            <div id="vault-list-container" class="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
              <!-- Rendered dynamically -->
            </div>
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
            <p class="text-xs text-[#a09e9d]">Download location and file saving preferences</p>
          </div>
        </div>

        <div class="bg-[#18181b] border border-[#28282e] rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <!-- Download Location -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="max-w-xl">
              <div class="text-sm font-semibold text-[#e5e2e1]">Download Location</div>
              <p class="text-xs text-[#a09e9d] mt-1 leading-relaxed">
                Files downloaded from the web will be saved to this folder on your computer.
              </p>
              <div class="mt-2.5">
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

          <!-- Always Ask Where to Save Toggle -->
          <label class="flex items-center justify-between cursor-pointer select-none group py-1">
            <div class="flex flex-col pr-4">
              <span class="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors">
                Always ask where to save each file before downloading
              </span>
              <span class="text-[11px] text-[#a09e9d] mt-0.5 leading-relaxed">
                When enabled, a file chooser will appear before every download. When disabled, files save directly into your download location.
              </span>
            </div>
            <div class="relative inline-flex items-center cursor-pointer shrink-0">
              <input id="settings-opt-ask-save" class="sr-only peer" type="checkbox">
              <div class="w-11 h-6 bg-[#3a3a3e] peer-checked:bg-[#f85e2a] rounded-full transition-colors duration-200 ease-in-out"></div>
              <div class="absolute left-0 top-0 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out translate-x-0 peer-checked:translate-x-5 pointer-events-none"></div>
            </div>
          </label>

          <div class="w-full h-px bg-[#232328]"></div>

          <!-- Open Folder on Completion Toggle -->
          <label class="flex items-center justify-between cursor-pointer select-none group py-1">
            <div class="flex flex-col pr-4">
              <span class="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors">
                Open folder automatically when download completes
              </span>
              <span class="text-[11px] text-[#a09e9d] mt-0.5 leading-relaxed">
                Reveals the downloaded file in your system file manager as soon as the transfer finishes.
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
  const cacheFeedback = container.querySelector("#settings-cache-feedback") as HTMLElement;
  const engineListEl = container.querySelector("#settings-page-engine-list") as HTMLElement;

  // Vault Elements
  const vaultCookiesSizeEl = container.querySelector("#vault-cookies-size") as HTMLElement;
  const btnClearCookies = container.querySelector("#btn-clear-cookies") as HTMLButtonElement;
  const tabLoginsBtn = container.querySelector("#vault-tab-logins") as HTMLButtonElement;
  const tabTokensBtn = container.querySelector("#vault-tab-tokens") as HTMLButtonElement;
  const countLoginsEl = container.querySelector("#vault-count-logins") as HTMLElement;
  const countTokensEl = container.querySelector("#vault-count-tokens") as HTMLElement;
  const btnVaultAdd = container.querySelector("#btn-vault-add") as HTMLButtonElement;
  const btnVaultAddLabel = container.querySelector("#btn-vault-add-label") as HTMLElement;
  const btnVaultClear = container.querySelector("#btn-vault-clear") as HTMLButtonElement;
  const vaultAddForm = container.querySelector("#vault-add-form") as HTMLElement;
  const vaultListContainer = container.querySelector("#vault-list-container") as HTMLElement;

  // Download Settings Elements
  const downloadPathEl = container.querySelector("#settings-download-path") as HTMLElement;
  const btnOpenDownloadDir = container.querySelector("#btn-settings-open-download-dir") as HTMLButtonElement;
  const btnChangeDownloadDir = container.querySelector("#btn-settings-change-download-dir") as HTMLButtonElement;
  const optAskSaveInput = container.querySelector("#settings-opt-ask-save") as HTMLInputElement;
  const optOpenCompleteInput = container.querySelector("#settings-opt-open-complete") as HTMLInputElement;

  function renderDownloadSettings() {
    const ds = config.download_settings;
    if (downloadPathEl) {
      downloadPathEl.textContent = ds?.download_dir || "~/Downloads";
      downloadPathEl.title = ds?.download_dir || "";
    }
    if (optAskSaveInput) {
      optAskSaveInput.checked = Boolean(ds?.ask_where_to_save);
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

  // Vault Management & UI Rendering
  async function refreshVault() {
    try {
      const stats = await tauriIpc.getVaultStats();
      vaultCookiesSizeEl.textContent = stats.cookies_formatted_size;
      countLoginsEl.textContent = String(stats.credentials_count);
      countTokensEl.textContent = String(stats.tokens_count);

      cachedCredentials = await tauriIpc.listSavedCredentials();
      cachedTokens = await tauriIpc.listEngineerTokens();

      renderVaultList();
    } catch (e) {
      console.error("Failed to refresh vault stats:", e);
    }
  }

  function renderVaultList() {
    vaultListContainer.innerHTML = "";

    if (activeVaultTab === "logins") {
      if (cachedCredentials.length === 0) {
        vaultListContainer.innerHTML = `
          <div class="py-8 text-center text-xs text-[#8e8d91] bg-[#1a1a1e] rounded-xl border border-[#27272f]">
            <span class="material-symbols-outlined text-2xl mb-1 text-[#4e4d52]">key_off</span>
            <p>No saved logins yet. Click "Add Login" to store credentials encrypted with AES-256-GCM.</p>
          </div>
        `;
        return;
      }

      cachedCredentials.forEach((cred) => {
        const item = document.createElement("div");
        item.className =
          "flex items-center justify-between p-3 rounded-xl bg-[#202026] hover:bg-[#25252e] border border-[#2b2b35] transition-all text-xs";

        const isRevealed = visibleSecrets.has(cred.id);
        const displayPassword = isRevealed ? cred.password : "••••••••••••";

        item.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-[#f85e2a]/15 text-[#f85e2a] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-sm">lock</span>
            </div>
            <div class="min-w-0 truncate">
              <div class="font-semibold text-[#e5e2e1] truncate flex items-center gap-2">
                <span>${cred.title || cred.origin}</span>
                ${
                  cred.title
                    ? `<span class="text-[10px] text-[#8e8d91] font-mono">(${cred.origin})</span>`
                    : ""
                }
              </div>
              <div class="text-[11px] text-[#a09e9d] flex items-center gap-2 mt-0.5">
                <span class="text-[#e2bfb4] font-medium">${cred.username}</span>
                <span class="text-[#4e4d52]">•</span>
                <span class="font-mono text-[10px] ${
                  isRevealed ? "text-[#ffb59e]" : "text-[#7e7d82]"
                }">${displayPassword}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              type="button"
              class="btn-vault-toggle p-1.5 rounded-lg bg-[#292932] hover:bg-[#343440] text-[#a09e9d] hover:text-[#e5e2e1] transition-colors cursor-pointer"
              title="${isRevealed ? 'Hide Password' : 'Show Password'}"
            >
              <span class="material-symbols-outlined text-sm">${isRevealed ? 'visibility_off' : 'visibility'}</span>
            </button>
            <button
              type="button"
              class="btn-vault-copy p-1.5 rounded-lg bg-[#292932] hover:bg-[#343440] text-[#a09e9d] hover:text-[#e5e2e1] transition-colors cursor-pointer"
              title="Copy Password"
            >
              <span class="material-symbols-outlined text-sm">content_copy</span>
            </button>
            <button
              type="button"
              class="btn-vault-delete p-1.5 rounded-lg bg-[#292932] hover:bg-[#93000a]/50 text-[#a09e9d] hover:text-[#ffb4ab] transition-colors cursor-pointer"
              title="Delete Login"
            >
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        `;

        item.querySelector(".btn-vault-toggle")?.addEventListener("click", () => {
          if (visibleSecrets.has(cred.id)) {
            visibleSecrets.delete(cred.id);
          } else {
            visibleSecrets.add(cred.id);
          }
          renderVaultList();
        });

        item.querySelector(".btn-vault-copy")?.addEventListener("click", async (e) => {
          await navigator.clipboard.writeText(cred.password);
          const icon = (e.currentTarget as HTMLElement).querySelector("span");
          if (icon) {
            icon.textContent = "check";
            setTimeout(() => {
              icon.textContent = "content_copy";
            }, 1500);
          }
        });

        item.querySelector(".btn-vault-delete")?.addEventListener("click", async () => {
          try {
            await tauriIpc.deleteCredential(cred.id);
            visibleSecrets.delete(cred.id);
            await refreshVault();
          } catch (e) {
            console.error("Failed to delete credential:", e);
          }
        });

        vaultListContainer.appendChild(item);
      });
    } else {
      // Engineer Tokens
      if (cachedTokens.length === 0) {
        vaultListContainer.innerHTML = `
          <div class="py-8 text-center text-xs text-[#8e8d91] bg-[#1a1a1e] rounded-xl border border-[#27272f]">
            <span class="material-symbols-outlined text-2xl mb-1 text-[#4e4d52]">vpn_key_off</span>
            <p>No engineer tokens yet. Click "Add Token" to store API keys, PATs, or SSH tokens encrypted with AES-256-GCM.</p>
          </div>
        `;
        return;
      }

      cachedTokens.forEach((tok) => {
        const item = document.createElement("div");
        item.className =
          "flex items-center justify-between p-3 rounded-xl bg-[#202026] hover:bg-[#25252e] border border-[#2b2b35] transition-all text-xs";

        const isRevealed = visibleSecrets.has(tok.id);
        const displayToken = isRevealed ? tok.token : "••••••••••••••••••••••••";

        item.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-[#71d98d]/15 text-[#71d98d] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-sm">key</span>
            </div>
            <div class="min-w-0 truncate">
              <div class="font-semibold text-[#e5e2e1] truncate flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-[#2c2c36] text-[#ffb59e] text-[10px] font-mono font-bold">${tok.service}</span>
                <span>${tok.label}</span>
              </div>
              <div class="text-[11px] text-[#a09e9d] flex items-center gap-2 mt-0.5">
                <span class="font-mono text-[10px] ${
                  isRevealed ? "text-[#71d98d]" : "text-[#7e7d82]"
                }">${displayToken}</span>
                ${
                  tok.notes
                    ? `<span class="text-[#4e4d52]">•</span><span class="text-[#8e8d91] truncate">${tok.notes}</span>`
                    : ""
                }
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0 ml-3">
            <button
              type="button"
              class="btn-vault-toggle p-1.5 rounded-lg bg-[#292932] hover:bg-[#343440] text-[#a09e9d] hover:text-[#e5e2e1] transition-colors cursor-pointer"
              title="${isRevealed ? 'Hide Token' : 'Show Token'}"
            >
              <span class="material-symbols-outlined text-sm">${isRevealed ? 'visibility_off' : 'visibility'}</span>
            </button>
            <button
              type="button"
              class="btn-vault-copy p-1.5 rounded-lg bg-[#292932] hover:bg-[#343440] text-[#a09e9d] hover:text-[#e5e2e1] transition-colors cursor-pointer"
              title="Copy Token"
            >
              <span class="material-symbols-outlined text-sm">content_copy</span>
            </button>
            <button
              type="button"
              class="btn-vault-delete p-1.5 rounded-lg bg-[#292932] hover:bg-[#93000a]/50 text-[#a09e9d] hover:text-[#ffb4ab] transition-colors cursor-pointer"
              title="Delete Token"
            >
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        `;

        item.querySelector(".btn-vault-toggle")?.addEventListener("click", () => {
          if (visibleSecrets.has(tok.id)) {
            visibleSecrets.delete(tok.id);
          } else {
            visibleSecrets.add(tok.id);
          }
          renderVaultList();
        });

        item.querySelector(".btn-vault-copy")?.addEventListener("click", async (e) => {
          await navigator.clipboard.writeText(tok.token);
          const icon = (e.currentTarget as HTMLElement).querySelector("span");
          if (icon) {
            icon.textContent = "check";
            setTimeout(() => {
              icon.textContent = "content_copy";
            }, 1500);
          }
        });

        item.querySelector(".btn-vault-delete")?.addEventListener("click", async () => {
          try {
            await tauriIpc.deleteEngineerToken(tok.id);
            visibleSecrets.delete(tok.id);
            await refreshVault();
          } catch (e) {
            console.error("Failed to delete token:", e);
          }
        });

        vaultListContainer.appendChild(item);
      });
    }
  }

  function showAddForm() {
    vaultAddForm.classList.remove("hidden");
    if (activeVaultTab === "logins") {
      vaultAddForm.innerHTML = `
        <div class="text-xs font-semibold text-[#e5e2e1] flex items-center justify-between">
          <span>Add New Encrypted Login</span>
          <span class="text-[10px] text-[#ffb59e] font-mono">AES-256-GCM</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            id="form-cred-origin"
            type="text"
            placeholder="Website / Domain (e.g. github.com)"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
          <input
            id="form-cred-title"
            type="text"
            placeholder="Friendly Title (optional, e.g. GitHub)"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
          <input
            id="form-cred-user"
            type="text"
            placeholder="Username / Email"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
          <input
            id="form-cred-pass"
            type="password"
            placeholder="Password"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            id="btn-form-cancel"
            class="px-3 py-1.5 rounded-xl bg-[#282830] hover:bg-[#32323c] text-[#a09e9d] hover:text-[#e5e2e1] text-xs font-medium cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-form-save"
            class="px-3.5 py-1.5 rounded-xl bg-[#f85e2a] hover:bg-[#ff7d47] text-[#521300] font-semibold text-xs cursor-pointer transition-colors"
          >
            Save Encrypted Login
          </button>
        </div>
      `;

      vaultAddForm.querySelector("#btn-form-cancel")?.addEventListener("click", () => {
        vaultAddForm.classList.add("hidden");
      });

      vaultAddForm.querySelector("#btn-form-save")?.addEventListener("click", async () => {
        const originInput = vaultAddForm.querySelector("#form-cred-origin") as HTMLInputElement;
        const userInput = vaultAddForm.querySelector("#form-cred-user") as HTMLInputElement;
        const passInput = vaultAddForm.querySelector("#form-cred-pass") as HTMLInputElement;
        const titleInput = vaultAddForm.querySelector("#form-cred-title") as HTMLInputElement;

        const origin = originInput.value.trim();
        const username = userInput.value.trim();
        const password = passInput.value;
        const title = titleInput.value.trim() || undefined;

        if (!origin || !username || !password) {
          alert("Please fill in Origin, Username, and Password.");
          return;
        }

        try {
          await tauriIpc.saveCredential(origin, username, password, title);
          vaultAddForm.classList.add("hidden");
          await refreshVault();
        } catch (e) {
          console.error("Failed to save credential:", e);
        }
      });
    } else {
      // Add Token Form
      vaultAddForm.innerHTML = `
        <div class="text-xs font-semibold text-[#e5e2e1] flex items-center justify-between">
          <span>Add New Engineer Token / API Key</span>
          <span class="text-[10px] text-[#71d98d] font-mono">AES-256-GCM</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            id="form-tok-service"
            type="text"
            placeholder="Service (e.g. GitHub, OpenAI, Jira, AWS)"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
          <input
            id="form-tok-label"
            type="text"
            placeholder="Label (e.g. Personal Access Token - Prod)"
            class="bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
          <input
            id="form-tok-val"
            type="password"
            placeholder="Token / Secret Key"
            class="sm:col-span-2 bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors font-mono"
          />
          <input
            id="form-tok-notes"
            type="text"
            placeholder="Notes (optional, e.g. expires 2027)"
            class="sm:col-span-2 bg-[#19191e] border border-[#34343f] focus:border-[#f85e2a] rounded-xl px-3 py-2 text-xs text-[#e5e2e1] outline-none transition-colors"
          />
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            id="btn-form-cancel"
            class="px-3 py-1.5 rounded-xl bg-[#282830] hover:bg-[#32323c] text-[#a09e9d] hover:text-[#e5e2e1] text-xs font-medium cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-form-save"
            class="px-3.5 py-1.5 rounded-xl bg-[#f85e2a] hover:bg-[#ff7d47] text-[#521300] font-semibold text-xs cursor-pointer transition-colors"
          >
            Save Encrypted Token
          </button>
        </div>
      `;

      vaultAddForm.querySelector("#btn-form-cancel")?.addEventListener("click", () => {
        vaultAddForm.classList.add("hidden");
      });

      vaultAddForm.querySelector("#btn-form-save")?.addEventListener("click", async () => {
        const serviceInput = vaultAddForm.querySelector("#form-tok-service") as HTMLInputElement;
        const labelInput = vaultAddForm.querySelector("#form-tok-label") as HTMLInputElement;
        const valInput = vaultAddForm.querySelector("#form-tok-val") as HTMLInputElement;
        const notesInput = vaultAddForm.querySelector("#form-tok-notes") as HTMLInputElement;

        const service = serviceInput.value.trim();
        const label = labelInput.value.trim();
        const token = valInput.value.trim();
        const notes = notesInput.value.trim() || undefined;

        if (!service || !label || !token) {
          alert("Please fill in Service, Label, and Token.");
          return;
        }

        try {
          await tauriIpc.saveEngineerToken(service, label, token, notes);
          vaultAddForm.classList.add("hidden");
          await refreshVault();
        } catch (e) {
          console.error("Failed to save engineer token:", e);
        }
      });
    }
  }

  // Vault Tab Handlers
  tabLoginsBtn.addEventListener("click", () => {
    activeVaultTab = "logins";
    tabLoginsBtn.className =
      "px-3 py-1 rounded-lg text-xs font-semibold bg-[#2a2a32] text-[#ffb59e] shadow-sm transition-all cursor-pointer";
    tabTokensBtn.className =
      "px-3 py-1 rounded-lg text-xs font-medium text-[#a09e9d] hover:text-[#e5e2e1] transition-all cursor-pointer";
    btnVaultAddLabel.textContent = "Add Login";
    vaultAddForm.classList.add("hidden");
    renderVaultList();
  });

  tabTokensBtn.addEventListener("click", () => {
    activeVaultTab = "tokens";
    tabTokensBtn.className =
      "px-3 py-1 rounded-lg text-xs font-semibold bg-[#2a2a32] text-[#ffb59e] shadow-sm transition-all cursor-pointer";
    tabLoginsBtn.className =
      "px-3 py-1 rounded-lg text-xs font-medium text-[#a09e9d] hover:text-[#e5e2e1] transition-all cursor-pointer";
    btnVaultAddLabel.textContent = "Add Token";
    vaultAddForm.classList.add("hidden");
    renderVaultList();
  });

  btnVaultAdd.addEventListener("click", () => {
    if (vaultAddForm.classList.contains("hidden")) {
      showAddForm();
    } else {
      vaultAddForm.classList.add("hidden");
    }
  });

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

  btnVaultClear.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to wipe all encrypted logins and tokens in your vault? This cannot be undone.")) {
      return;
    }
    try {
      await tauriIpc.clearVaultData();
      visibleSecrets.clear();
      await refreshVault();
    } catch (e) {
      console.error("Failed to clear vault data:", e);
    }
  });

  clearCacheBtn.addEventListener("click", handleClearCache);
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

  optAskSaveInput?.addEventListener("change", async () => {
    if (!config.download_settings) {
      config.download_settings = {
        download_dir: "~/Downloads",
        ask_where_to_save: optAskSaveInput.checked,
        open_folder_on_complete: false,
      };
    } else {
      config.download_settings.ask_where_to_save = optAskSaveInput.checked;
    }
    await tauriIpc.updateAppConfig(config);
    onConfigUpdated(config);
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
    renderSearchEngines();
    renderDownloadSettings();
    refreshCacheSize();
    refreshVault();
    container.classList.remove("hidden");
  }

  function hide() {
    container.classList.add("hidden");
    vaultAddForm.classList.add("hidden");
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
