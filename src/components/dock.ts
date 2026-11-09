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

export function createDock(
  onSelectTab: (tabId: "workspaces" | "bookmarks" | "settings" | "home") => void
) {
  const aside = document.createElement("aside");
  aside.className =
    "fixed left-0 top-20 bottom-0 w-16 bg-[#0e0e0e] z-40 flex flex-col items-center py-4 justify-between border-r border-[#202020] shadow-[1px_0_12px_rgba(0,0,0,0.4)]";

  aside.innerHTML = `
    <!-- Top Navigation Icons -->
    <nav class="flex flex-col items-center gap-2.5 w-full px-2">
      <!-- Workspaces Icon (active by default) -->
      <button
        id="dock-btn-workspaces"
        title="Multi-Thread Workspaces"
        class="dock-item relative w-11 h-11 rounded-xl flex items-center justify-center transition-all text-[#FFDBD0] hover:bg-[#202020]"
      >
        <span class="material-symbols-outlined text-[22px]">grid_view</span>
      </button>

      <!-- Add -->
      <button
        id="dock-btn-bookmarks"
        title="Add"
        class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all"
      >
        <span class="material-symbols-outlined text-[22px]">add</span>
      </button>
    </nav>

    <!-- Bottom Settings -->
    <div class="flex flex-col items-center gap-2 w-full px-2">
      <button
        id="dock-btn-settings"
        title="Browser Settings"
        class="dock-item w-11 h-11 rounded-xl flex items-center justify-center text-[#e2bfb4] hover:bg-[#202020] hover:text-[#e5e2e1] transition-all"
      >
        <span class="material-symbols-outlined text-[22px]">settings</span>
      </button>
    </div>
  `;

  const setActive = (activeId: string) => {
    aside.querySelectorAll(".dock-item").forEach((btn) => {
      btn.classList.remove("text-[#FFDBD0]", "bg-[#f85e2a]", "text-[#521300]", "shadow-md");
      btn.classList.add("text-[#e2bfb4]", "hover:bg-[#202020]", "hover:text-[#e5e2e1]");
      const indicator = btn.querySelector("span.absolute");
      if (indicator) indicator.remove();
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

  return aside;
}
