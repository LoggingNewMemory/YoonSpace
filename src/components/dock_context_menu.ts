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

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let dockContextMenu: HTMLElement | null = null;

export function hideDockContextMenu() {
  if (dockContextMenu) {
    dockContextMenu.remove();
    dockContextMenu = null;
  }
}

export function showDockContextMenu(
  x: number,
  y: number,
  tab: MinimizedTab,
  onSplitLeft?: () => void,
  onSplitRight?: () => void,
  onClose?: () => void
) {
  hideDockContextMenu();

  const menu = document.createElement("div");
  menu.id = "dock-context-menu";
  menu.className =
    "fixed z-[10000] py-1.5 px-1 bg-[#1e1e22]/95 backdrop-blur-md border border-[#38383e] rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.6)] text-xs text-[#e5e2e1] min-w-[180px] select-none";

  const menuX = Math.min(x, window.innerWidth - 190);
  const menuY = Math.min(y, window.innerHeight - 150);
  menu.style.left = `${menuX}px`;
  menu.style.top = `${menuY}px`;

  menu.innerHTML = `
    <div class="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-[#a09e9d] uppercase truncate border-b border-[#2e2e34] mb-1">
      ${escapeHtml(tab.title)}
    </div>
    <button
      type="button"
      id="ctx-split-left"
      class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#f85e2a]/20 hover:text-[#ffb59e] text-left transition-colors cursor-pointer group"
    >
      <span class="material-symbols-outlined text-[16px] text-[#aa8a80] group-hover:text-[#ffb59e]">dock_to_left</span>
      <span class="font-medium">Tile to Left</span>
    </button>
    <button
      type="button"
      id="ctx-split-right"
      class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#f85e2a]/20 hover:text-[#ffb59e] text-left transition-colors cursor-pointer group"
    >
      <span class="material-symbols-outlined text-[16px] text-[#aa8a80] group-hover:text-[#ffb59e]">dock_to_right</span>
      <span class="font-medium">Tile to Right</span>
    </button>
    <div class="h-px bg-[#2e2e34] my-1"></div>
    <button
      type="button"
      id="ctx-close-tab"
      class="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#93000a]/40 hover:text-[#ffb4ab] text-left transition-colors cursor-pointer text-[#aa8a80]"
    >
      <span class="material-symbols-outlined text-[16px]">close</span>
      <span class="font-medium">Close Tab</span>
    </button>
  `;

  const onGlobalClick = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      hideDockContextMenu();
      window.removeEventListener("pointerdown", onGlobalClick);
      window.removeEventListener("keydown", onGlobalKey);
    }
  };

  const onGlobalKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideDockContextMenu();
      window.removeEventListener("pointerdown", onGlobalClick);
      window.removeEventListener("keydown", onGlobalKey);
    }
  };

  setTimeout(() => {
    window.addEventListener("pointerdown", onGlobalClick);
    window.addEventListener("keydown", onGlobalKey);
  }, 10);

  menu.querySelector("#ctx-split-left")?.addEventListener("click", () => {
    hideDockContextMenu();
    onSplitLeft?.();
  });
  menu.querySelector("#ctx-split-right")?.addEventListener("click", () => {
    hideDockContextMenu();
    onSplitRight?.();
  });
  menu.querySelector("#ctx-close-tab")?.addEventListener("click", () => {
    hideDockContextMenu();
    onClose?.();
  });

  document.body.appendChild(menu);
  dockContextMenu = menu;
}
