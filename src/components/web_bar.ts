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

export interface WebBarController {
  element: HTMLElement;
  setTitle: (title: string) => void;
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
}

export function createWebBar(
  onMinimize: () => void,
  onClose: () => void
): WebBarController {
  const container = document.createElement("div");
  container.id = "web-header-bar";
  container.className =
    "hidden fixed top-20 left-16 right-0 h-7 z-40 px-4 flex items-center justify-between border-b border-[#353535]/40 select-none shadow-sm bg-[#242426]";

  container.innerHTML = `
    <!-- Left Spacer to keep center title perfectly balanced -->
    <div class="w-32 flex items-center"></div>

    <!-- Center Web Title -->
    <div class="flex-1 flex items-center justify-center text-center px-2 overflow-hidden">
      <span id="web-bar-title" class="font-mono text-xs font-medium tracking-wide text-[#d1d5db] truncate max-w-md">
        Web View
      </span>
    </div>

    <!-- Right Controls: Minimize & Close (Matching Google Stitch Design) -->
    <div class="w-32 flex items-center justify-end gap-1.5 text-[#aa8a80]">
      <!-- Minimize button (minimizes to sidebar) -->
      <button
        id="btn-web-min"
        type="button"
        title="Minimize to Sidebar"
        aria-label="Minimize"
        class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#e5e2e1] hover:bg-[#353535] transition-colors cursor-pointer active:scale-95"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Close button -->
      <button
        id="btn-web-close"
        type="button"
        title="Close Tab"
        aria-label="Close"
        class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a]/40 transition-colors cursor-pointer active:scale-95"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;

  const titleEl = container.querySelector("#web-bar-title") as HTMLElement;

  container.querySelector("#btn-web-min")?.addEventListener("click", (e) => {
    e.stopPropagation();
    onMinimize();
  });

  container.querySelector("#btn-web-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });

  return {
    element: container,
    setTitle: (title: string) => {
      if (titleEl) {
        titleEl.textContent = title || "Web View";
        titleEl.title = title || "";
      }
    },
    show: () => {
      container.classList.remove("hidden");
      container.classList.add("flex");
    },
    hide: () => {
      container.classList.add("hidden");
      container.classList.remove("flex");
    },
    isVisible: () => !container.classList.contains("hidden"),
  };
}
