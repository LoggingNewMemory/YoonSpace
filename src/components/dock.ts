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
  onHoverTabsChange?: (isHovered: boolean) => void
): DockController {
  const aside = document.createElement("aside");
  aside.id = "app-dock";
  aside.className =
    "fixed left-0 top-20 bottom-0 w-16 bg-[#0e0e0e] z-40 flex flex-col py-3.5 justify-between border-r border-[#202020] shadow-[2px_0_12px_rgba(0,0,0,0.4)] select-none overflow-visible";

  aside.innerHTML = `
    <!-- Top Navigation & Tabs Section -->
    <div class="flex flex-col items-start w-full px-2.5 gap-2 overflow-visible">
      <!-- 2x2 Grid View & Add Buttons -->
      <nav class="flex flex-col items-start gap-2 w-full overflow-visible">
        <!-- Workspaces 2x2 Grid Button -->
        <button
          id="dock-btn-workspaces"
          title="Multi-Thread Workspaces"
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
      </nav>

      <!-- Divider line below top buttons -->
      <div class="w-11 h-px bg-[#202020] my-0.5 shrink-0"></div>

      <!-- Web Tabs Container -->
      <div id="dock-tabs-list" class="flex flex-col items-start gap-2 w-full overflow-visible">
      </div>
    </div>

    <!-- Bottom Settings -->
    <div class="flex flex-col items-start w-full px-2.5 overflow-visible">
      <button
        id="dock-btn-settings"
        title="Browser Settings"
        class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all cursor-pointer shrink-0"
      >
        <span class="material-symbols-outlined text-[22px]">settings</span>
      </button>
    </div>
  `;

  const tabsContainer = aside.querySelector("#dock-tabs-list") as HTMLElement;
  const tabsMap = new Map<string, MinimizedTab>();
  let currentActiveTabId: string | null = null;

  // Tabs container hover listener for overlay layout adjustment
  tabsContainer.addEventListener("mouseenter", () => {
    onHoverTabsChange?.(true);
  });

  tabsContainer.addEventListener("mouseleave", () => {
    onHoverTabsChange?.(false);
  });

  const createTabElement = (tab: MinimizedTab, isActive: boolean): HTMLElement => {
    const isSplit = Boolean(tab.isSplit && tab.leftUrl && tab.rightUrl);
    const wrapper = document.createElement("div");
    wrapper.className = "dock-tab-wrapper relative w-11 h-11 shrink-0 overflow-visible";
    wrapper.setAttribute("data-tab-id", tab.id);

    // Initial state: ALWAYS compact (44px wide). If active: orange rounded square container.
    const pill = document.createElement("div");
    pill.id = `dock-tab-${tab.id}`;
    pill.className = `dock-tab-pill absolute left-0 top-0 h-11 rounded-xl flex items-center cursor-pointer select-none transition-all duration-180 ease-out overflow-hidden z-20 ${
      isActive
        ? "bg-[#f85e2a]/15 border-2 border-[#f85e2a] text-[#e5e2e1] shadow-[0_0_12px_rgba(248,94,42,0.25)]"
        : "bg-[#1a1a1c] border border-[#2b2b2e] text-[#e2bfb4] hover:border-[#3d3d42]"
    }`;
    pill.style.width = "44px";

    const iconsHtml = isSplit ? renderSplitIcons(tab) : renderSingleIcon(tab);

    pill.innerHTML = `
      <!-- Icon Container (Single or Split) - perfectly centered in compact button -->
      <div class="dock-tab-icon-container flex items-center justify-center shrink-0 w-10 h-10">
        ${iconsHtml}
      </div>

      <!-- Expanded Content: Divider | Title ... | Close Button ✕ (hidden unless hovered) -->
      <div class="dock-tab-expanded-content flex items-center flex-1 min-w-0 pr-1.5 transition-opacity duration-150 opacity-0 pointer-events-none">
        <!-- Vertical Divider | -->
        <div class="w-px h-4 bg-[#3d3d40] mr-2.5 ml-0.5 shrink-0"></div>

        <!-- Truncated Title ... -->
        <span class="tab-title-text truncate text-xs font-medium text-[#e5e2e1] flex-1 text-left select-none tracking-tight" title="${escapeHtml(
          tab.title
        )}">
          ${escapeHtml(tab.title)}
        </span>

        <!-- Close Button ✕ -->
        <button
          type="button"
          class="tab-close-btn w-5 h-5 rounded-md flex items-center justify-center text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a]/40 ml-1 shrink-0 transition-colors cursor-pointer"
          title="Close tab"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;

    // Click on Close button ✕
    const closeBtn = pill.querySelector(".tab-close-btn");
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      onCloseTab?.(tab.id);
    });

    // Click on Tab pill to activate
    pill.addEventListener("click", () => {
      onActivateTab?.(tab);
    });

    // Hover expand for ANY tab (active or inactive)
    wrapper.addEventListener("mouseenter", () => {
      pill.style.width = "200px";
      pill.style.zIndex = "50";

      if (tab.id === currentActiveTabId) {
        pill.classList.remove("bg-[#f85e2a]/15", "shadow-[0_0_12px_rgba(248,94,42,0.25)]");
        pill.classList.add(
          "bg-[#261f1c]",
          "border-2",
          "border-[#f85e2a]",
          "shadow-[0_4px_16px_rgba(248,94,42,0.35)]"
        );
      } else {
        pill.classList.remove("bg-[#1a1a1c]", "border-[#2b2b2e]");
        pill.classList.add(
          "bg-[#202022]",
          "border-[#404044]",
          "shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
        );
      }

      const exp = pill.querySelector(".dock-tab-expanded-content") as HTMLElement;
      if (exp) {
        exp.classList.remove("opacity-0", "pointer-events-none");
        exp.classList.add("opacity-100", "pointer-events-auto");
      }
    });

    wrapper.addEventListener("mouseleave", () => {
      pill.style.width = "44px";
      pill.style.zIndex = "20";

      if (tab.id === currentActiveTabId) {
        pill.classList.remove(
          "bg-[#261f1c]",
          "shadow-[0_4px_16px_rgba(248,94,42,0.35)]"
        );
        pill.classList.add(
          "bg-[#f85e2a]/15",
          "border-2",
          "border-[#f85e2a]",
          "shadow-[0_0_12px_rgba(248,94,42,0.25)]"
        );
      } else {
        pill.classList.remove(
          "bg-[#202022]",
          "border-[#404044]",
          "shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
        );
        pill.classList.add("bg-[#1a1a1c]", "border-[#2b2b2e]");
      }

      const exp = pill.querySelector(".dock-tab-expanded-content") as HTMLElement;
      if (exp) {
        exp.classList.remove("opacity-100", "pointer-events-auto");
        exp.classList.add("opacity-0", "pointer-events-none");
      }
    });

    wrapper.appendChild(pill);
    return wrapper;
  };

  const renderTabs = () => {
    tabsContainer.innerHTML = "";
    tabsMap.forEach((tab) => {
      const isActive = tab.id === currentActiveTabId;
      const el = createTabElement(tab, isActive);
      tabsContainer.appendChild(el);
    });
  };

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

      const wrapper = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
      if (wrapper) {
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

    // Update workspaces button active styling
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

  // Nav buttons click handlers
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

  return {
    element: aside,
    getWidth: () => 64,
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
