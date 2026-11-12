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

import type { MinimizedTab } from "../types";
import { getFaviconUrl, getFallbackIcon } from "../utils/favicon";

export interface DockController {
  element: HTMLElement;
  getWidth: () => number;
  isExpanded: () => boolean;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  addTab: (tab: MinimizedTab) => void;
  removeTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string, leftTitle?: string, rightTitle?: string) => void;
  setActiveTabId: (activeTabId: string | null) => void;
  getActiveTabId: () => string | null;
  getTabs: () => MinimizedTab[];
  getTab: (tabId: string) => MinimizedTab | undefined;
  // Backward-compatible aliases
  addMinimizedTab: (tab: MinimizedTab) => void;
  removeMinimizedTab: (tabId: string) => void;
  updateMinimizedTab: (tabId: string, title: string) => void;
  setActiveTab: (tabId: string) => void;
  getMinimizedTab: (tabId: string) => MinimizedTab | undefined;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSingleIcon(tab: MinimizedTab): string {
  const favicon = getFaviconUrl(tab.url);
  const fallback = tab.icon || getFallbackIcon(tab.url, tab.title);
  return `
    <div class="site-icon-box w-6 h-6 rounded-md flex items-center justify-center overflow-hidden shrink-0 bg-[#252528]/80">
      ${
        favicon
          ? `<img src="${favicon}" alt="" class="site-favicon-img w-[18px] h-[18px] object-contain rounded-sm" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
          : ""
      }
      <span class="material-symbols-outlined site-fallback-icon text-[17px] text-[#ffb59e] ${
        favicon ? "hidden" : "flex"
      } items-center justify-center" style="${favicon ? "display: none;" : "display: flex;"}">
        ${fallback}
      </span>
    </div>
  `;
}

function renderSplitIcons(tab: MinimizedTab): string {
  const leftFavicon = getFaviconUrl(tab.leftUrl);
  const rightFavicon = getFaviconUrl(tab.rightUrl);
  const leftFallback = tab.leftIcon || getFallbackIcon(tab.leftUrl, tab.leftTitle || tab.title);
  const rightFallback = tab.rightIcon || getFallbackIcon(tab.rightUrl, tab.rightTitle || tab.title);

  return `
    <div class="flex items-center justify-center gap-1 shrink-0 h-6">
      <!-- Left Site Icon -->
      <div class="w-4 h-4 rounded-sm flex items-center justify-center overflow-hidden shrink-0 bg-[#252528]/80">
        ${
          leftFavicon
            ? `<img src="${leftFavicon}" alt="" class="w-3.5 h-3.5 object-contain" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
            : ""
        }
        <span class="material-symbols-outlined text-[12px] text-[#ffb59e] ${
          leftFavicon ? "hidden" : "flex"
        } items-center justify-center" style="${leftFavicon ? "display: none;" : "display: flex;"}">
          ${leftFallback}
        </span>
      </div>

      <!-- Vertical Divider | between the two site icons -->
      <div class="w-px h-3.5 bg-[#454545] shrink-0"></div>

      <!-- Right Site Icon -->
      <div class="w-4 h-4 rounded-sm flex items-center justify-center overflow-hidden shrink-0 bg-[#252528]/80">
        ${
          rightFavicon
            ? `<img src="${rightFavicon}" alt="" class="w-3.5 h-3.5 object-contain" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />`
            : ""
        }
        <span class="material-symbols-outlined text-[12px] text-[#ffb59e] ${
          rightFavicon ? "hidden" : "flex"
        } items-center justify-center" style="${rightFavicon ? "display: none;" : "display: flex;"}">
          ${rightFallback}
        </span>
      </div>
    </div>
  `;
}

export function createDock(
  onSelectTab: (tabId: "workspaces" | "bookmarks" | "settings" | "home") => void,
  onActivateTab?: (tab: MinimizedTab) => void,
  onCloseTab?: (tabId: string) => void,
  onNewTab?: () => void,
  onToggleExpanded?: (expanded: boolean) => void
): DockController {
  const aside = document.createElement("aside");
  aside.id = "app-dock";

  const tabsMap = new Map<string, MinimizedTab>();
  let currentActiveTabId: string | null = null;
  let isExpanded = false;

  const updateShell = () => {
    if (!isExpanded) {
      aside.className =
        "fixed left-0 top-20 bottom-0 w-16 bg-[#0e0e0e] z-40 flex flex-col py-3.5 justify-between border-r border-[#202020] shadow-[2px_0_12px_rgba(0,0,0,0.4)] select-none overflow-hidden transition-[width] duration-200 ease-out";

      aside.innerHTML = `
        <!-- Top Navigation & Tabs Section -->
        <div class="flex flex-col items-center w-full px-2 gap-2">
          <!-- 2x2 Grid View, Add & Toggle Buttons -->
          <nav class="flex flex-col items-center gap-2 w-full">
            <!-- Workspaces 2x2 Grid Button -->
            <button
              id="dock-btn-workspaces"
              title="YoonSpace"
              class="dock-item relative w-11 h-11 rounded-xl flex items-center justify-center transition-all text-[#FFDBD0] bg-[#222224] hover:bg-[#2c2c30] cursor-pointer shadow-sm shrink-0"
            >
              <span class="material-symbols-outlined text-[22px]">grid_view</span>
            </button>

            <!-- Add Button (+) -->
            <button
              id="dock-btn-add"
              title="New Tab / Search"
              class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all cursor-pointer shrink-0"
            >
              <span class="material-symbols-outlined text-[22px]">add</span>
            </button>

            <!-- Expand Toggle Button -->
            <button
              id="dock-btn-toggle"
              title="Expand Sidebar (Ctrl+B)"
              class="dock-item w-11 h-6 rounded-md flex items-center justify-center text-[#707076] hover:text-[#e5e2e1] hover:bg-[#202022] transition-colors cursor-pointer shrink-0"
            >
              <span class="material-symbols-outlined text-[17px]">dock_to_right</span>
            </button>
          </nav>

          <!-- Divider line below top buttons -->
          <div class="w-11 h-px bg-[#202020] my-0.5 shrink-0"></div>

          <!-- Web Tabs Container -->
          <div id="dock-tabs-list" class="flex flex-col items-center gap-2 w-full"></div>
        </div>

        <!-- Bottom Settings -->
        <div class="flex flex-col items-center w-full px-2">
          <button
            id="dock-btn-settings"
            title="Browser Settings"
            class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all cursor-pointer shrink-0"
          >
            <span class="material-symbols-outlined text-[22px]">settings</span>
          </button>
        </div>
      `;
    } else {
      aside.className =
        "fixed left-0 top-20 bottom-0 w-[220px] bg-[#0e0e0e] z-40 flex flex-col py-3.5 px-2.5 justify-between border-r border-[#202020] shadow-[2px_0_16px_rgba(0,0,0,0.5)] select-none overflow-hidden transition-[width] duration-200 ease-out";

      aside.innerHTML = `
        <!-- Top Navigation & Tabs Section (Arc / Zen Style) -->
        <div class="flex flex-col items-start w-full gap-2">
          <!-- Top Row: Workspaces label + Collapse button -->
          <div class="flex items-center justify-between w-full">
            <button
              id="dock-btn-workspaces"
              title="YoonSpace"
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[#FFDBD0] bg-[#222224] hover:bg-[#2c2c30] transition-colors cursor-pointer text-xs font-semibold shadow-sm"
            >
              <span class="material-symbols-outlined text-[19px]">grid_view</span>
              <span>YoonSpace</span>
            </button>

            <button
              id="dock-btn-toggle"
              title="Collapse Sidebar (Ctrl+B)"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-[#88888e] hover:text-[#e5e2e1] hover:bg-[#202022] transition-colors cursor-pointer"
            >
              <span class="material-symbols-outlined text-[18px]">dock_to_left</span>
            </button>
          </div>

          <!-- New Tab / Search full row button -->
          <button
            id="dock-btn-add"
            title="New Tab / Search"
            class="w-full h-8 px-2.5 rounded-xl flex items-center gap-2 text-[#e2bfb4] hover:bg-[#202022] hover:text-[#e5e2e1] border border-[#2b2b2e] hover:border-[#3d3d42] transition-colors cursor-pointer text-xs font-medium"
          >
            <span class="material-symbols-outlined text-[17px]">add</span>
            <span class="truncate">New Tab / Search</span>
          </button>

          <!-- Divider line below top buttons -->
          <div class="w-full h-px bg-[#202020] my-0.5 shrink-0"></div>

          <!-- Web Tabs Container -->
          <div id="dock-tabs-list" class="flex flex-col items-start gap-1.5 w-full overflow-y-auto"></div>
        </div>

        <!-- Bottom Settings -->
        <div class="flex flex-col items-start w-full">
          <button
            id="dock-btn-settings"
            title="Browser Settings"
            class="w-full h-9 px-2.5 rounded-xl flex items-center gap-2.5 text-[#e2bfb4] hover:bg-[#202022] hover:text-[#e5e2e1] transition-colors cursor-pointer text-xs font-medium"
          >
            <span class="material-symbols-outlined text-[18px]">settings</span>
            <span>Settings</span>
          </button>
        </div>
      `;
    }

    // Attach common navigation button handlers
    aside.querySelector("#dock-btn-workspaces")?.addEventListener("click", () => {
      setActiveTabId(null);
      onSelectTab("workspaces");
    });

    aside.querySelector("#dock-btn-add")?.addEventListener("click", () => {
      if (onNewTab) {
        onNewTab();
      } else {
        onSelectTab("bookmarks");
      }
    });

    aside.querySelector("#dock-btn-settings")?.addEventListener("click", () => {
      onSelectTab("settings");
    });

    aside.querySelector("#dock-btn-toggle")?.addEventListener("click", () => {
      toggleExpanded();
    });
  };

  const createTabElement = (tab: MinimizedTab, isActive: boolean): HTMLElement => {
    const isSplit = Boolean(tab.isSplit && tab.leftUrl && tab.rightUrl);
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-tab-id", tab.id);
    wrapper.setAttribute("title", tab.title);

    const iconsHtml = isSplit ? renderSplitIcons(tab) : renderSingleIcon(tab);

    if (!isExpanded) {
      // COMPACT ICON RAIL (64px)
      wrapper.className = "dock-tab-wrapper relative w-11 h-11 shrink-0 group select-none";
      const pill = document.createElement("div");
      pill.id = `dock-tab-${tab.id}`;
      pill.className = `dock-tab-pill relative w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer select-none transition-all duration-150 overflow-hidden ${
        isActive
          ? "bg-[#f85e2a]/15 border-2 border-[#f85e2a] text-[#e5e2e1] shadow-[0_0_12px_rgba(248,94,42,0.25)]"
          : "bg-[#1a1a1c] border border-[#2b2b2e] text-[#e2bfb4] hover:border-[#3d3d42] hover:bg-[#202022]"
      }`;

      pill.innerHTML = `
        <div class="dock-tab-icon-container flex items-center justify-center shrink-0 w-10 h-10">
          ${iconsHtml}
        </div>
        <button
          type="button"
          class="tab-close-btn absolute top-1 right-1 w-4 h-4 rounded-full bg-[#242428] border border-[#45454a] text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-sm cursor-pointer z-30"
          title="Close tab"
        >
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      pill.querySelector(".tab-close-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        onCloseTab?.(tab.id);
      });

      pill.addEventListener("click", () => {
        onActivateTab?.(tab);
      });

      wrapper.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          onCloseTab?.(tab.id);
        }
      });

      wrapper.appendChild(pill);
      return wrapper;
    } else {
      // EXPANDED ARC / ZEN SIDEBAR (220px)
      wrapper.className = "dock-tab-wrapper relative w-full h-10 shrink-0 group select-none";
      const pill = document.createElement("div");
      pill.id = `dock-tab-${tab.id}`;
      pill.className = `dock-tab-pill relative w-full h-10 px-2 rounded-xl flex items-center cursor-pointer select-none transition-all duration-150 overflow-hidden ${
        isActive
          ? "bg-[#261f1c] border-2 border-[#f85e2a] text-[#e5e2e1] shadow-[0_4px_16px_rgba(248,94,42,0.25)]"
          : "bg-[#161618] border border-[#262629] text-[#c5c2c1] hover:border-[#38383c] hover:bg-[#202022]"
      }`;

      pill.innerHTML = `
        <!-- Left Icon Container -->
        <div class="dock-tab-icon-container flex items-center justify-center shrink-0 w-6 h-6 mr-1.5">
          ${iconsHtml}
        </div>

        <!-- Vertical Divider -->
        <div class="w-px h-3.5 bg-[#3d3d40] mr-2 shrink-0"></div>

        <!-- Truncated Tab Title -->
        <span class="tab-title-text truncate text-xs font-medium text-[#e5e2e1] flex-1 text-left tracking-tight select-none">
          ${escapeHtml(tab.title)}
        </span>

        <!-- Dedicated Close Button ✕ -->
        <button
          type="button"
          class="tab-close-btn w-5 h-5 rounded-md flex items-center justify-center text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a]/40 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          title="Close tab"
        >
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      pill.querySelector(".tab-close-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        onCloseTab?.(tab.id);
      });

      pill.addEventListener("click", () => {
        onActivateTab?.(tab);
      });

      wrapper.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          onCloseTab?.(tab.id);
        }
      });

      wrapper.appendChild(pill);
      return wrapper;
    }
  };

  const renderTabs = () => {
    const tabsContainer = aside.querySelector("#dock-tabs-list");
    if (!tabsContainer) return;
    tabsContainer.innerHTML = "";
    tabsMap.forEach((tab) => {
      const isActive = tab.id === currentActiveTabId;
      const el = createTabElement(tab, isActive);
      tabsContainer.appendChild(el);
    });
  };

  const setExpanded = (expanded: boolean) => {
    isExpanded = expanded;
    updateShell();
    renderTabs();
    onToggleExpanded?.(isExpanded);
  };

  const toggleExpanded = () => {
    setExpanded(!isExpanded);
  };

  // Initial shell render
  updateShell();

  const addTab = (tab: MinimizedTab) => {
    tabsMap.set(tab.id, tab);
    renderTabs();
  };

  const removeTab = (tabId: string) => {
    tabsMap.delete(tabId);
    if (currentActiveTabId === tabId) {
      currentActiveTabId = null;
    }
    renderTabs();
  };

  const updateTabTitle = (tabId: string, title: string, leftTitle?: string, rightTitle?: string) => {
    const tab = tabsMap.get(tabId);
    if (tab) {
      tab.title = title;
      if (leftTitle) tab.leftTitle = leftTitle;
      if (rightTitle) tab.rightTitle = rightTitle;

      const wrapper = aside.querySelector(`[data-tab-id="${tabId}"]`);
      if (wrapper) {
        wrapper.setAttribute("title", title);
        const titleEl = wrapper.querySelector(".tab-title-text") as HTMLElement;
        if (titleEl) {
          titleEl.textContent = title;
          titleEl.title = title;
        }
      }
    }
  };

  const setActiveTabId = (activeId: string | null) => {
    currentActiveTabId = activeId;

    const workspacesBtn = aside.querySelector("#dock-btn-workspaces");
    if (workspacesBtn) {
      if (!activeId) {
        workspacesBtn.classList.add("bg-[#222224]", "text-[#FFDBD0]");
        workspacesBtn.classList.remove("text-[#e2bfb4]", "bg-transparent");
      } else {
        workspacesBtn.classList.remove("bg-[#222224]", "text-[#FFDBD0]");
        workspacesBtn.classList.add("text-[#e2bfb4]", "bg-transparent");
      }
    }

    renderTabs();
  };

  return {
    element: aside,
    getWidth: () => (isExpanded ? 220 : 64),
    isExpanded: () => isExpanded,
    toggleExpanded,
    setExpanded,
    addTab,
    removeTab,
    updateTabTitle,
    setActiveTabId,
    getActiveTabId: () => currentActiveTabId,
    getTabs: () => Array.from(tabsMap.values()),
    getTab: (id) => tabsMap.get(id),
    // Backward-compatible aliases
    addMinimizedTab: addTab,
    removeMinimizedTab: removeTab,
    updateMinimizedTab: (id, title) => updateTabTitle(id, title),
    setActiveTab: (id) => setActiveTabId(id),
    getMinimizedTab: (id) => tabsMap.get(id),
  };
}
