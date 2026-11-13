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

export interface WebBarCallbacks {
  onMinimize: () => void;
  onClose: () => void;
  onMinimizeLeft?: () => void;
  onCloseLeft?: () => void;
  onMinimizeRight?: () => void;
  onCloseRight?: () => void;
}

export interface WebBarController {
  element: HTMLElement;
  setSingleMode: (title: string) => void;
  setSplitMode: (leftTitle: string, rightTitle: string) => void;
  setTitle: (title: string) => void;
  setLeftTitle: (title: string) => void;
  setRightTitle: (title: string) => void;
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  isSplit: () => boolean;
  setLeftOffset: (offset: number) => void;
  setTopOffset: (offset: number) => void;
  setRightOffset: (offset: number) => void;
}

export function createWebBar(
  callbacksOrOnMinimize: WebBarCallbacks | (() => void),
  onCloseParam?: () => void
): WebBarController {
  const callbacks: WebBarCallbacks =
    typeof callbacksOrOnMinimize === "function"
      ? {
          onMinimize: callbacksOrOnMinimize,
          onClose: onCloseParam || (() => {}),
        }
      : callbacksOrOnMinimize;

  const container = document.createElement("div");
  container.id = "web-header-bar";
  container.className =
    "hidden fixed top-20 left-16 right-0 h-7 z-40 px-0 flex items-center border-b border-[#353535]/40 select-none shadow-sm bg-[#242426] transition-[left,right] duration-200 ease-out";

  container.innerHTML = `
    <!-- Single View Header Bar -->
    <div id="web-bar-single" class="w-full h-full flex items-center justify-between px-4">
      <!-- Left Spacer to keep center title perfectly balanced -->
      <div class="w-32 flex items-center"></div>

      <!-- Center Web Title -->
      <div class="flex-1 flex items-center justify-center text-center px-2 overflow-hidden">
        <span id="web-bar-title" class="text-xs font-medium tracking-wide text-[#d1d5db] truncate max-w-md">
          Web View
        </span>
      </div>

      <!-- Right Controls: Minimize & Close -->
      <div class="w-32 flex items-center justify-end gap-1.5 text-[#aa8a80]">
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
    </div>

    <!-- Dual Split View Header Bar -->
    <div id="web-bar-split" class="hidden w-full h-full flex items-center">
      <!-- Left Pane Header (50% Width) -->
      <div class="w-1/2 h-full flex items-center justify-between px-3 border-r border-[#353535]/80 min-w-0">
        <div class="w-16 flex items-center flex-shrink-0"></div>
        <div class="flex-1 flex items-center justify-center text-center px-2 overflow-hidden">
          <span id="web-bar-left-title" class="text-xs font-medium tracking-wide text-[#d1d5db] truncate max-w-xs">
            Left Pane
          </span>
        </div>
        <div class="w-16 flex items-center justify-end gap-1 text-[#aa8a80] flex-shrink-0">
          <button
            id="btn-web-left-min"
            type="button"
            title="Minimize Left Tab"
            aria-label="Minimize Left"
            class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#e5e2e1] hover:bg-[#353535] transition-colors cursor-pointer active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button
            id="btn-web-left-close"
            type="button"
            title="Close Left Tab"
            aria-label="Close Left"
            class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a]/40 transition-colors cursor-pointer active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Right Pane Header (50% Width) -->
      <div class="w-1/2 h-full flex items-center justify-between px-3 min-w-0">
        <div class="w-16 flex items-center flex-shrink-0"></div>
        <div class="flex-1 flex items-center justify-center text-center px-2 overflow-hidden">
          <span id="web-bar-right-title" class="text-xs font-medium tracking-wide text-[#d1d5db] truncate max-w-xs">
            Right Pane
          </span>
        </div>
        <div class="w-16 flex items-center justify-end gap-1 text-[#aa8a80] flex-shrink-0">
          <button
            id="btn-web-right-min"
            type="button"
            title="Minimize Right Tab"
            aria-label="Minimize Right"
            class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#e5e2e1] hover:bg-[#353535] transition-colors cursor-pointer active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button
            id="btn-web-right-close"
            type="button"
            title="Close Right Tab"
            aria-label="Close Right"
            class="w-6 h-6 rounded flex items-center justify-center text-[#aa8a80] hover:text-[#ffb4ab] hover:bg-[#93000a]/40 transition-colors cursor-pointer active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const singleBar = container.querySelector("#web-bar-single") as HTMLElement;
  const splitBar = container.querySelector("#web-bar-split") as HTMLElement;
  const singleTitleEl = container.querySelector("#web-bar-title") as HTMLElement;
  const leftTitleEl = container.querySelector("#web-bar-left-title") as HTMLElement;
  const rightTitleEl = container.querySelector("#web-bar-right-title") as HTMLElement;

  let currentMode: "single" | "split" = "single";

  // Event handlers
  container.querySelector("#btn-web-min")?.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onMinimize();
  });

  container.querySelector("#btn-web-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onClose();
  });

  container.querySelector("#btn-web-left-min")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (callbacks.onMinimizeLeft) {
      callbacks.onMinimizeLeft();
    } else {
      callbacks.onMinimize();
    }
  });

  container.querySelector("#btn-web-left-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (callbacks.onCloseLeft) {
      callbacks.onCloseLeft();
    } else {
      callbacks.onClose();
    }
  });

  container.querySelector("#btn-web-right-min")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (callbacks.onMinimizeRight) {
      callbacks.onMinimizeRight();
    } else {
      callbacks.onMinimize();
    }
  });

  container.querySelector("#btn-web-right-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (callbacks.onCloseRight) {
      callbacks.onCloseRight();
    } else {
      callbacks.onClose();
    }
  });

  const setSingleMode = (title: string) => {
    currentMode = "single";
    splitBar.classList.add("hidden");
    splitBar.classList.remove("flex");
    singleBar.classList.remove("hidden");
    singleBar.classList.add("flex");
    if (singleTitleEl) {
      singleTitleEl.textContent = title || "Web View";
      singleTitleEl.title = title || "";
    }
  };

  const setSplitMode = (leftTitle: string, rightTitle: string) => {
    currentMode = "split";
    singleBar.classList.add("hidden");
    singleBar.classList.remove("flex");
    splitBar.classList.remove("hidden");
    splitBar.classList.add("flex");
    if (leftTitleEl) {
      leftTitleEl.textContent = leftTitle || "Left Pane";
      leftTitleEl.title = leftTitle || "";
    }
    if (rightTitleEl) {
      rightTitleEl.textContent = rightTitle || "Right Pane";
      rightTitleEl.title = rightTitle || "";
    }
  };

  return {
    element: container,
    setSingleMode,
    setSplitMode,
    setTitle: (title: string) => {
      if (currentMode === "split") {
        if (title.includes("|")) {
          const parts = title.split("|").map((p) => p.trim());
          setSplitMode(parts[0], parts[1]);
        } else {
          setSingleMode(title);
        }
      } else {
        setSingleMode(title);
      }
    },
    setLeftTitle: (title: string) => {
      if (leftTitleEl) {
        leftTitleEl.textContent = title || "Left Pane";
        leftTitleEl.title = title || "";
      }
    },
    setRightTitle: (title: string) => {
      if (rightTitleEl) {
        rightTitleEl.textContent = title || "Right Pane";
        rightTitleEl.title = title || "";
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
    isSplit: () => currentMode === "split",
    setLeftOffset: (offset: number) => {
      container.style.left = `${offset}px`;
    },
    setTopOffset: (offset: number) => {
      container.style.top = `${offset}px`;
    },
    setRightOffset: (offset: number) => {
      container.style.right = `${offset}px`;
    },
  };
}
