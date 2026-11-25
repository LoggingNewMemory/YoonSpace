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
import type { BookmarkItem, MinimizedTab } from "../types";
import {
  getCachedFaviconSync,
  getDomain,
  getFallbackIcon,
  normalizeUrlForCache,
  onFaviconCached,
  primeFaviconCacheFromBookmarks,
  resolveAndCacheFavicon,
} from "../utils/favicon";
import { escapeHtml } from "./dock_context_menu";

export interface BookmarksController {
  element: HTMLElement;
  show: () => void;
  hide: () => void;
  toggle: () => void;
  isOpen: () => boolean;
  setLeftOffset: (offset: number) => void;
  updateActiveSite: (tab: MinimizedTab | null, isViewOpen: boolean) => void;
  refresh: () => Promise<void>;
  getBookmarks: () => BookmarkItem[];
  focusCustomInput: () => void;
  destroy: () => void;
}

function normalizeCompareUrl(raw: string): string {
  try {
    const u = new URL(normalizeUrlForCache(raw));
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

function renderSiteLogoHtml(url: string, dataUrl?: string, sizeClass = "w-8 h-8", iconSize = "18px"): string {
  const src = dataUrl || getCachedFaviconSync(url);
  const fallback = getFallbackIcon(url);
  return `
    <div class="${sizeClass} rounded-lg bg-[#242428] border border-[#323238] flex items-center justify-center overflow-hidden shrink-0 select-none">
      ${
        src
          ? `<img src="${escapeHtml(src)}" alt="" draggable="false" class="w-4/5 h-4/5 object-contain rounded-sm pointer-events-none" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
          : ""
      }
      <span class="material-symbols-outlined text-[#ffb59e] items-center justify-center pointer-events-none" style="font-size: ${iconSize}; ${src ? "display: none;" : "display: flex;"}">
        ${fallback}
      </span>
    </div>
  `;
}

export function createBookmarksController(
  onClose?: () => void,
  onOpenBookmark?: (url: string, title?: string) => void,
  onBookmarksChanged?: (bookmarks: BookmarkItem[]) => void
): BookmarksController {
  const sidebar = document.createElement("aside");
  sidebar.id = "yoonspace-bookmarks-sidebar";
  sidebar.className =
    "hidden fixed top-[80px] bottom-0 z-40 w-[360px] flex flex-col border-r border-[#2e2e30] bg-[#161618] text-[#e5e2e1] shadow-2xl select-none overflow-hidden transition-[left] duration-200 ease-out";
  sidebar.style.left = "64px";

  let isDrawerVisible = false;
  let bookmarks: BookmarkItem[] = [];
  let activeTab: MinimizedTab | null = null;
  let activeViewOpen = false;
  let searchQuery = "";
  let editingId: string | null = null;
  let isSubmittingCustom = false;

  sidebar.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2e2e30] bg-[#1a1a1c] shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-[#28282b] flex items-center justify-center text-[#f85e2a]">
          <span class="material-symbols-outlined text-[18px]">bookmarks</span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white tracking-tight">Bookmarks</h2>
            <span id="bookmarks-header-count" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f85e2a]/20 text-[#f85e2a] border border-[#f85e2a]/30">0</span>
          </div>
          <p class="text-[11px] text-neutral-400 font-mono mt-0.5">Save sites &amp; cached logos</p>
        </div>
      </div>

      <button
        type="button"
        id="btn-close-bookmarks"
        aria-label="Close Bookmarks"
        title="Close Bookmarks"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none"
      >
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>

    <!-- Scrollable Body -->
    <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar" style="scrollbar-width: thin;">
      <!-- 1. Current Site Quick-Bookmark Card (Visible when a web page is open) -->
      <section id="bookmarks-current-site-section" class="hidden space-y-2">
        <div class="flex items-center justify-between px-0.5">
          <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Current Site</span>
        </div>
        <div id="bookmarks-current-site-card" class="space-y-2"></div>
      </section>

      <!-- 2. Simply Add Custom Site Form -->
      <section class="space-y-2">
        <div class="flex items-center justify-between px-0.5">
          <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Add Custom Site</span>
        </div>

        <form id="bookmarks-custom-form" class="p-3 rounded-xl bg-[#1a1a1d] border border-[#2c2c30] space-y-2.5">
          <div class="space-y-2">
            <div class="relative">
              <input
                type="text"
                id="bookmark-custom-url"
                placeholder="Site URL (e.g. github.com)"
                required
                autocomplete="off"
                spellcheck="false"
                class="w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white placeholder-neutral-500 selection:bg-[#f85e2a] selection:text-white"
              />
            </div>
            <input
              type="text"
              id="bookmark-custom-title"
              placeholder="Name (optional, auto-detected)"
              autocomplete="off"
              class="w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white placeholder-neutral-500 selection:bg-[#f85e2a] selection:text-white"
            />
          </div>

          <div id="bookmark-custom-error" class="hidden text-[11px] text-[#ffb4ab]"></div>

          <button
            type="submit"
            id="bookmark-custom-submit"
            class="w-full py-1.5 px-3 rounded-lg bg-[#f85e2a] hover:bg-[#ff7240] text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99]"
          >
            <span class="material-symbols-outlined text-[16px]">bookmark_add</span>
            <span id="bookmark-custom-submit-label">Add Bookmark</span>
          </button>
        </form>
      </section>

      <!-- 3. Saved Bookmarks List -->
      <section class="space-y-2.5">
        <div class="flex items-center justify-between px-0.5">
          <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-neutral-400">Saved Bookmarks</span>
        </div>

        <div id="bookmarks-search-wrap" class="hidden relative">
          <span class="material-symbols-outlined text-[15px] text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
          <input
            type="text"
            id="bookmarks-search-input"
            placeholder="Filter bookmarks..."
            autocomplete="off"
            spellcheck="false"
            class="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#1a1a1d] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white placeholder-neutral-500"
          />
        </div>

        <div id="bookmarks-list" class="space-y-2"></div>
      </section>
    </div>
  `;

  if (document.body) {
    document.body.appendChild(sidebar);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(sidebar);
    });
  }

  const countBadge = sidebar.querySelector("#bookmarks-header-count") as HTMLElement;
  const closeBtn = sidebar.querySelector("#btn-close-bookmarks") as HTMLButtonElement;
  const currentSiteSection = sidebar.querySelector("#bookmarks-current-site-section") as HTMLElement;
  const currentSiteCard = sidebar.querySelector("#bookmarks-current-site-card") as HTMLElement;
  const customForm = sidebar.querySelector("#bookmarks-custom-form") as HTMLFormElement;
  const customUrlInput = sidebar.querySelector("#bookmark-custom-url") as HTMLInputElement;
  const customTitleInput = sidebar.querySelector("#bookmark-custom-title") as HTMLInputElement;
  const customErrorEl = sidebar.querySelector("#bookmark-custom-error") as HTMLElement;
  const customSubmitBtn = sidebar.querySelector("#bookmark-custom-submit") as HTMLButtonElement;
  const customSubmitLabel = sidebar.querySelector("#bookmark-custom-submit-label") as HTMLElement;
  const searchWrap = sidebar.querySelector("#bookmarks-search-wrap") as HTMLElement;
  const searchInput = sidebar.querySelector("#bookmarks-search-input") as HTMLInputElement;
  const listContainer = sidebar.querySelector("#bookmarks-list") as HTMLElement;

  const findBookmarkForUrl = (url: string): BookmarkItem | undefined => {
    const target = normalizeCompareUrl(url);
    return bookmarks.find((b) => normalizeCompareUrl(b.url) === target);
  };

  const notifyBookmarksChanged = () => {
    if (countBadge) {
      countBadge.textContent = String(bookmarks.length);
    }
    if (searchWrap) {
      if (bookmarks.length > 3) {
        searchWrap.classList.remove("hidden");
      } else {
        searchWrap.classList.add("hidden");
      }
    }
    onBookmarksChanged?.(bookmarks);
  };

  const renderCurrentSite = () => {
    if (!currentSiteSection || !currentSiteCard) return;

    const sites: { label: string; title: string; url: string }[] = [];
    if (activeViewOpen && activeTab) {
      if (activeTab.isSplit) {
        if (activeTab.leftUrl && /^https?:\/\//i.test(activeTab.leftUrl)) {
          sites.push({
            label: "Left Pane",
            title: activeTab.leftTitle || getDomain(activeTab.leftUrl) || "Left View",
            url: activeTab.leftUrl,
          });
        }
        if (activeTab.rightUrl && /^https?:\/\//i.test(activeTab.rightUrl)) {
          sites.push({
            label: "Right Pane",
            title: activeTab.rightTitle || getDomain(activeTab.rightUrl) || "Right View",
            url: activeTab.rightUrl,
          });
        }
      } else if (activeTab.url && /^https?:\/\//i.test(activeTab.url)) {
        sites.push({
          label: "Active Tab",
          title: activeTab.title || getDomain(activeTab.url) || "Current Site",
          url: activeTab.url,
        });
      }
    }

    if (sites.length === 0) {
      currentSiteSection.classList.add("hidden");
      currentSiteCard.innerHTML = "";
      return;
    }

    currentSiteSection.classList.remove("hidden");
    currentSiteCard.innerHTML = sites
      .map((site, idx) => {
        const existing = findBookmarkForUrl(site.url);
        const domain = getDomain(site.url) || site.url;
        const cachedLogo = existing?.icon_data_url || getCachedFaviconSync(site.url);
        if (!cachedLogo) {
          void resolveAndCacheFavicon(site.url, undefined, site.title);
        }

        return `
          <div class="p-3 rounded-xl bg-gradient-to-br from-[#231d1b] via-[#1c1c20] to-[#17171a] border border-[#382d29] shadow-sm space-y-2.5">
            ${
              sites.length > 1
                ? `<div class="text-[10px] font-mono uppercase tracking-wider text-[#ffb59e]">${escapeHtml(site.label)}</div>`
                : ""
            }
            <div class="flex items-center gap-2.5 min-w-0">
              ${renderSiteLogoHtml(site.url, cachedLogo, "w-9 h-9", "20px")}
              <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-white truncate" title="${escapeHtml(site.title)}">${escapeHtml(site.title)}</div>
                <div class="text-[11px] text-[#aa8a80] font-mono truncate" title="${escapeHtml(site.url)}">${escapeHtml(domain)}</div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              ${
                existing
                  ? `
                  <button
                    type="button"
                    data-current-idx="${idx}"
                    data-remove-id="${escapeHtml(existing.id)}"
                    class="btn-remove-current-bookmark flex-1 py-1.5 px-2.5 rounded-lg bg-[#242429] hover:bg-[#93000a]/40 border border-[#3a3a42] hover:border-[#ff5449]/60 text-[#71d98d] hover:text-[#ffb4ab] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span class="material-symbols-outlined text-[15px]">bookmark_added</span>
                    <span>Bookmarked (Remove)</span>
                  </button>
                `
                  : `
                  <button
                    type="button"
                    data-current-idx="${idx}"
                    class="btn-save-current-bookmark flex-1 py-1.5 px-2.5 rounded-lg bg-[#f85e2a] hover:bg-[#ff7240] text-black text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <span class="material-symbols-outlined text-[16px]">bookmark_add</span>
                    <span>Bookmark Current Site</span>
                  </button>
                `
              }
            </div>
          </div>
        `;
      })
      .join("");

    currentSiteCard.querySelectorAll(".btn-save-current-bookmark").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.getAttribute("data-current-idx") || "0", 10);
        const site = sites[idx];
        if (!site) return;
        const el = btn as HTMLButtonElement;
        el.disabled = true;
        el.innerHTML = `<span class="material-symbols-outlined text-[15px] animate-spin">progress_activity</span><span>Saving...</span>`;
        try {
          const added = await tauriIpc.addBookmark(site.url, site.title);
          if (added.icon_data_url) {
            primeFaviconCacheFromBookmarks([added]);
          }
          await refresh();
        } catch (err) {
          console.error("Failed to bookmark current site:", err);
          el.disabled = false;
          renderCurrentSite();
        }
      });
    });

    currentSiteCard.querySelectorAll(".btn-remove-current-bookmark").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-remove-id");
        if (!id) return;
        try {
          await tauriIpc.deleteBookmark(id);
          await refresh();
        } catch (err) {
          console.error("Failed to remove bookmark:", err);
        }
      });
    });
  };

  const renderBookmarksList = () => {
    if (!listContainer) return;
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? bookmarks.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            getDomain(b.url).includes(q)
        )
      : bookmarks;

    if (bookmarks.length === 0) {
      listContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 text-center text-[#8e8d91] gap-2 select-none rounded-xl border border-dashed border-[#2c2c32] bg-[#141416]/60 px-4">
          <div class="w-10 h-10 rounded-xl bg-[#202024] border border-[#2e2e34] flex items-center justify-center text-[#aa8a80]">
            <span class="material-symbols-outlined text-[22px]">bookmark_add</span>
          </div>
          <div class="text-xs font-semibold text-neutral-300 mt-0.5">No bookmarks yet</div>
          <p class="text-[11px] text-[#7c7b80] leading-relaxed">
            Bookmark the active site above or add any custom site URL. Logos are cached locally.
          </p>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="py-6 text-center text-xs text-neutral-500">
          No bookmarks match "${escapeHtml(searchQuery)}"
        </div>
      `;
      return;
    }

    listContainer.innerHTML = "";

    for (const bm of filtered) {
      const card = document.createElement("div");

      if (editingId === bm.id) {
        card.className = "p-3 rounded-xl bg-[#1e1e22] border border-[#f85e2a]/50 space-y-2.5";
        card.innerHTML = `
          <form class="bookmark-edit-form space-y-2">
            <input
              type="text"
              class="edit-bm-title w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white"
              value="${escapeHtml(bm.title)}"
              placeholder="Bookmark name"
              required
            />
            <input
              type="text"
              class="edit-bm-url w-full px-2.5 py-1.5 rounded-lg bg-[#121214] border border-[#2c2c30] focus:border-[#f85e2a] outline-none text-xs text-white font-mono"
              value="${escapeHtml(bm.url)}"
              placeholder="https://..."
              required
            />
            <label class="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer select-none">
              <input type="checkbox" class="edit-bm-refresh accent-[#f85e2a]" />
              <span>Re-detect &amp; refresh cached site logo</span>
            </label>
            <div class="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                class="btn-cancel-edit px-2.5 py-1 rounded-lg bg-[#26262b] hover:bg-[#323238] text-xs text-neutral-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="px-3 py-1 rounded-lg bg-[#f85e2a] hover:bg-[#ff7240] text-black text-xs font-semibold cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        `;

        card.querySelector(".btn-cancel-edit")?.addEventListener("click", () => {
          editingId = null;
          renderBookmarksList();
        });

        card.querySelector(".bookmark-edit-form")?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const newTitle = (card.querySelector(".edit-bm-title") as HTMLInputElement).value.trim();
          const newUrl = (card.querySelector(".edit-bm-url") as HTMLInputElement).value.trim();
          const refreshIcon = (card.querySelector(".edit-bm-refresh") as HTMLInputElement).checked;
          if (!newUrl) return;
          try {
            await tauriIpc.updateBookmark(bm.id, newUrl, newTitle, refreshIcon);
            editingId = null;
            await refresh();
          } catch (err) {
            console.error("Failed to update bookmark:", err);
          }
        });
      } else {
        const domain = getDomain(bm.url) || bm.url;
        const cachedDataUrl = bm.icon_data_url || getCachedFaviconSync(bm.url);
        if (!cachedDataUrl) {
          void resolveAndCacheFavicon(bm.url, bm.icon_url, bm.title);
        }

        card.className =
          "p-2.5 rounded-xl bg-[#1a1a1d] hover:bg-[#222227] border border-[#2c2c30] hover:border-[#3e3e46] transition-all flex items-center justify-between gap-2.5 group cursor-pointer shadow-sm";
        card.title = `${bm.title}\n${bm.url}`;

        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            ${renderSiteLogoHtml(bm.url, cachedDataUrl, "w-8 h-8", "18px")}
            <div class="min-w-0 flex-1">
              <div class="text-xs font-semibold text-[#e5e2e1] group-hover:text-white truncate">${escapeHtml(bm.title)}</div>
              <div class="text-[11px] text-[#8e8a88] font-mono truncate">${escapeHtml(domain)}</div>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              class="btn-edit-bm w-6 h-6 rounded-md hover:bg-[#32323a] text-[#9c9a98] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Edit bookmark"
            >
              <span class="material-symbols-outlined text-[14px]">edit</span>
            </button>
            <button
              type="button"
              class="btn-delete-bm w-6 h-6 rounded-md hover:bg-[#93000a]/50 text-[#9c9a98] hover:text-[#ffb4ab] flex items-center justify-center transition-colors cursor-pointer"
              title="Delete bookmark"
            >
              <span class="material-symbols-outlined text-[14px]">delete</span>
            </button>
          </div>
        `;

        card.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".btn-edit-bm, .btn-delete-bm")) return;
          onOpenBookmark?.(bm.url, bm.title);
        });

        card.querySelector(".btn-edit-bm")?.addEventListener("click", (e) => {
          e.stopPropagation();
          editingId = bm.id;
          renderBookmarksList();
        });

        card.querySelector(".btn-delete-bm")?.addEventListener("click", async (e) => {
          e.stopPropagation();
          try {
            await tauriIpc.deleteBookmark(bm.id);
            await refresh();
          } catch (err) {
            console.error("Failed to delete bookmark:", err);
          }
        });
      }

      listContainer.appendChild(card);
    }
  };

  async function refresh(): Promise<void> {
    try {
      bookmarks = await tauriIpc.listBookmarks();
      primeFaviconCacheFromBookmarks(bookmarks);
      notifyBookmarksChanged();
      renderCurrentSite();
      renderBookmarksList();
    } catch (e) {
      console.warn("Failed to refresh bookmarks:", e);
    }
  }

  customForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmittingCustom) return;

    const rawUrl = customUrlInput?.value.trim() || "";
    const rawTitle = customTitleInput?.value.trim() || "";
    if (!rawUrl) return;

    customErrorEl.classList.add("hidden");
    isSubmittingCustom = true;
    customSubmitBtn.disabled = true;
    customSubmitLabel.textContent = "Detecting & caching...";

    try {
      const added = await tauriIpc.addBookmark(rawUrl, rawTitle || undefined);
      if (added.icon_data_url) {
        primeFaviconCacheFromBookmarks([added]);
      }
      customForm.reset();
      await refresh();
    } catch (err: any) {
      customErrorEl.textContent = typeof err === "string" ? err : "Could not add site URL.";
      customErrorEl.classList.remove("hidden");
    } finally {
      isSubmittingCustom = false;
      customSubmitBtn.disabled = false;
      customSubmitLabel.textContent = "Add Bookmark";
    }
  });

  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderBookmarksList();
  });

  closeBtn?.addEventListener("click", () => {
    hide();
    onClose?.();
  });

  // Update rendered icons whenever background logo caching finishes
  const unsubscribeFavicon = onFaviconCached(() => {
    if (isDrawerVisible) {
      renderCurrentSite();
      renderBookmarksList();
    }
  });

  function show() {
    isDrawerVisible = true;
    sidebar.classList.remove("hidden");
    void refresh();
  }

  function hide() {
    isDrawerVisible = false;
    editingId = null;
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

  function updateActiveSite(tab: MinimizedTab | null, isViewOpen: boolean) {
    activeTab = tab;
    activeViewOpen = isViewOpen;
    renderCurrentSite();
  }

  function focusCustomInput() {
    customUrlInput?.focus();
    customUrlInput?.select();
  }

  // Initial load on startup (populates cache + welcome screen)
  void refresh();

  return {
    element: sidebar,
    show,
    hide,
    toggle,
    isOpen: () => isDrawerVisible,
    setLeftOffset,
    updateActiveSite,
    refresh,
    getBookmarks: () => bookmarks,
    focusCustomInput,
    destroy: () => {
      unsubscribeFavicon();
      sidebar.remove();
    },
  };
}

export function createWelcomeBookmarksSection(
  onOpenBookmark: (url: string, title?: string) => void,
  onOpenBookmarksDrawer: () => void
) {
  const section = document.createElement("section");
  section.id = "welcome-bookmarks-section";
  section.className = "w-full flex flex-col mt-1 hidden";

  const render = (bookmarks: BookmarkItem[]) => {
    if (!bookmarks || bookmarks.length === 0) {
      section.classList.add("hidden");
      section.innerHTML = "";
      return;
    }

    section.classList.remove("hidden");
    section.innerHTML = `
      <div class="w-full flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[#f85e2a] text-[19px]">bookmarks</span>
            <h2 class="text-sm font-semibold text-[#e5e2e1] tracking-tight">Bookmarks</h2>
          </div>
          <button
            type="button"
            id="btn-welcome-manage-bookmarks"
            class="text-[11px] font-medium text-[#aa8a80] hover:text-[#ffb59e] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span class="material-symbols-outlined text-[14px]">add</span>
            <span>Add / Manage</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          ${bookmarks
            .map((bm) => {
              const cachedLogo = bm.icon_data_url || getCachedFaviconSync(bm.url);
              const domain = getDomain(bm.url) || bm.url;
              return `
                <button
                  type="button"
                  data-bm-url="${escapeHtml(bm.url)}"
                  data-bm-title="${escapeHtml(bm.title)}"
                  title="${escapeHtml(bm.title)} (${escapeHtml(bm.url)})"
                  class="welcome-bookmark-card flex items-center gap-2.5 p-2.5 rounded-xl bg-[#202020] hover:bg-[#2a2a2e] border border-[#353535]/50 hover:border-[#f85e2a]/50 transition-all cursor-pointer text-left group shadow-sm min-w-0"
                >
                  ${renderSiteLogoHtml(bm.url, cachedLogo, "w-7 h-7", "16px")}
                  <div class="min-w-0 flex-1">
                    <div class="text-xs font-semibold text-[#e5e2e1] group-hover:text-white truncate">${escapeHtml(bm.title)}</div>
                    <div class="text-[10px] text-[#aa8a80] font-mono truncate">${escapeHtml(domain)}</div>
                  </div>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    `;

    section.querySelector("#btn-welcome-manage-bookmarks")?.addEventListener("click", () => {
      onOpenBookmarksDrawer();
    });

    section.querySelectorAll(".welcome-bookmark-card").forEach((card) => {
      card.addEventListener("click", () => {
        const url = card.getAttribute("data-bm-url");
        const title = card.getAttribute("data-bm-title") || undefined;
        if (url) {
          onOpenBookmark(url, title);
        }
      });
    });
  };

  return { element: section, render };
}
