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

export interface DockController {
  element: HTMLElement;
  addMinimizedTab: (tab: MinimizedTab) => void;
  removeMinimizedTab: (tabId: string) => void;
  updateMinimizedTab: (tabId: string, title: string) => void;
  setActiveTab: (tabId: string) => void;
  getMinimizedTab: (tabId: string) => MinimizedTab | undefined;
}

export function createDock(
  onSelectTab: (tabId: "workspaces" | "bookmarks" | "settings" | "home") => void,
  onRestoreTab?: (tab: MinimizedTab) => void
): DockController {
  const aside = document.createElement("aside");
  aside.className =
    "fixed left-0 top-20 bottom-0 w-16 bg-[#0e0e0e] z-40 flex flex-col items-center py-4 justify-between border-r border-[#202020] shadow-[1px_0_12px_rgba(0,0,0,0.4)]";

  aside.innerHTML = `
    <!-- Top Navigation Icons -->
    <div class="flex flex-col items-center gap-2.5 w-full px-2">
      <nav class="flex flex-col items-center gap-2.5 w-full">
        <!-- Workspaces Icon (active by default) -->
        <button
          id="dock-btn-workspaces"
          title="Multi-Thread Workspaces"
          class="dock-item relative w-11 h-11 rounded-xl flex items-center justify-center transition-all text-[#FFDBD0] hover:bg-[#202020] cursor-pointer"
        >
          <span class="material-symbols-outlined text-[22px]">grid_view</span>
        </button>

        <!-- Add -->
        <button
          id="dock-btn-bookmarks"
          title="Add"
          class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all cursor-pointer"
        >
          <span class="material-symbols-outlined text-[22px]">add</span>
        </button>
      </nav>

      <!-- Minimized Web Tabs Container (Sidebar) -->
      <div id="dock-minimized-tabs" class="flex flex-col items-center gap-2 w-full pt-2 border-t border-[#202020]/60 empty:hidden">
      </div>
    </div>

    <!-- Bottom Settings -->
    <div class="flex flex-col items-center gap-2 w-full px-2">
      <button
        id="dock-btn-settings"
        title="Browser Settings"
        class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all cursor-pointer"
      >
        <span class="material-symbols-outlined text-[22px]">settings</span>
      </button>
    </div>
  `;

  const tabsContainer = aside.querySelector("#dock-minimized-tabs") as HTMLElement;
  const minimizedTabsMap = new Map<string, MinimizedTab>();

  const setActive = (activeId: string) => {
    aside.querySelectorAll(".dock-item").forEach((btn) => {
      btn.classList.remove("text-[#FFDBD0]", "bg-[#f85e2a]", "text-[#521300]", "shadow-md");
      btn.classList.add("text-[#e2bfb4]", "hover:bg-[#202020]", "hover:text-[#e5e2e1]");
    });

    const activeBtn = aside.querySelector(`#${activeId}`);
    if (activeBtn) {
      activeBtn.classList.remove("text-[#e2bfb4]", "hover:text-[#e5e2e1]");
      activeBtn.classList.add("text-[#FFDBD0]");
    }
  };

  aside.querySelector("#dock-btn-workspaces")?.addEventListener("click", () => {
    setActive("dock-btn-workspaces");
    onSelectTab("workspaces");
  });

  aside.querySelector("#dock-btn-bookmarks")?.addEventListener("click", () => {
    setActive("dock-btn-bookmarks");
    onSelectTab("bookmarks");
  });

  aside.querySelector("#dock-btn-settings")?.addEventListener("click", () => {
    setActive("dock-btn-settings");
    onSelectTab("settings");
  });

  const addMinimizedTab = (tab: MinimizedTab) => {
    minimizedTabsMap.set(tab.id, tab);

    // Remove existing if any
    const existing = tabsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
    if (existing) {
      existing.remove();
    }

    const btn = document.createElement("button");
    btn.id = `dock-tab-${tab.id}`;
    btn.setAttribute("data-tab-id", tab.id);
    btn.title = `${tab.title} (Click to restore)`;
    btn.className =
      "dock-item dock-minimized-tab relative w-11 h-11 rounded-xl flex items-center justify-center text-[#ffb59e] hover:bg-[#2a2a2a] transition-all cursor-pointer group";

    btn.innerHTML = `
      <span class="material-symbols-outlined text-[20px] text-[#ffb59e] group-hover:scale-110 transition-transform">
        ${tab.isSplit ? "splitscreen" : "language"}
      </span>
      <!-- Active / Minimized indicator dot -->
      <span class="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#f85e2a] shadow-sm animate-pulse"></span>
    `;

    btn.addEventListener("click", () => {
      setActive(`dock-tab-${tab.id}`);
      if (onRestoreTab) {
        onRestoreTab(tab);
      }
    });

    tabsContainer.appendChild(btn);
  };

  const removeMinimizedTab = (tabId: string) => {
    minimizedTabsMap.delete(tabId);
    const el = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
    if (el) {
      el.remove();
    }
  };

  const updateMinimizedTab = (tabId: string, title: string) => {
    const tab = minimizedTabsMap.get(tabId);
    if (tab) {
      tab.title = title;
      const el = tabsContainer.querySelector(`[data-tab-id="${tabId}"]`) as HTMLElement;
      if (el) {
        el.title = `${title} (Click to restore)`;
      }
    }
  };

  return {
    element: aside,
    addMinimizedTab,
    removeMinimizedTab,
    updateMinimizedTab,
    setActiveTab: setActive,
    getMinimizedTab: (id) => minimizedTabsMap.get(id),
  };
}
