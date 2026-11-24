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
  setSplitMode: (leftTitle: string, rightTitle: string, initialRatio?: number) => void;
  setSplitRatio: (ratio: number) => void;
  getSplitRatio: () => number;
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
  startProgress: (pane?: "single" | "left" | "right") => void;
  setProgress: (progress: number, pane?: "single" | "left" | "right") => void;
  finishProgress: (pane?: "single" | "left" | "right") => void;
  resetProgress: (pane?: "single" | "left" | "right") => void;
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
    <div id="web-bar-single" class="w-full h-full flex items-center justify-between px-4 relative overflow-hidden">
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

      <!-- Orange Load Progress Bar for Single View (Color: #f85e2a / #ff7843) -->
      <div
        id="web-bar-progress-single"
        class="absolute bottom-0 left-0 h-[2.5px] bg-gradient-to-r from-[#f85e2a] via-[#ff7843] to-[#ff9870] shadow-[0_0_10px_rgba(248,94,42,0.85),0_0_3px_rgba(248,94,42,1)] opacity-0 pointer-events-none z-50 rounded-r-full"
        style="width: 0%;"
      ></div>
    </div>

    <!-- Dual Split View Header Bar -->
    <div id="web-bar-split" class="hidden w-full h-full flex items-center relative overflow-hidden">
      <!-- Left Pane Header -->
      <div id="web-bar-left-pane" class="h-full flex items-center justify-between px-3 min-w-0 relative overflow-hidden" style="width: 50%;">
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

        <!-- Orange Load Progress Bar for Left Pane -->
        <div
          id="web-bar-progress-left"
          class="absolute bottom-0 left-0 h-[2.5px] bg-gradient-to-r from-[#f85e2a] via-[#ff7843] to-[#ff9870] shadow-[0_0_10px_rgba(248,94,42,0.85),0_0_3px_rgba(248,94,42,1)] opacity-0 pointer-events-none z-50 rounded-r-full"
          style="width: 0%;"
        ></div>
      </div>

      <!-- Right Pane Header -->
      <div id="web-bar-right-pane" class="h-full flex items-center justify-between px-3 min-w-0 relative overflow-hidden" style="width: 50%;">
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

        <!-- Orange Load Progress Bar for Right Pane -->
        <div
          id="web-bar-progress-right"
          class="absolute bottom-0 left-0 h-[2.5px] bg-gradient-to-r from-[#f85e2a] via-[#ff7843] to-[#ff9870] shadow-[0_0_10px_rgba(248,94,42,0.85),0_0_3px_rgba(248,94,42,1)] opacity-0 pointer-events-none z-50 rounded-r-full"
          style="width: 0%;"
        ></div>
      </div>
    </div>
  `;

  const singleBar = container.querySelector("#web-bar-single") as HTMLElement;
  const splitBar = container.querySelector("#web-bar-split") as HTMLElement;
  const singleTitleEl = container.querySelector("#web-bar-title") as HTMLElement;
  const leftPaneEl = container.querySelector("#web-bar-left-pane") as HTMLElement;
  const rightPaneEl = container.querySelector("#web-bar-right-pane") as HTMLElement;
  const leftTitleEl = container.querySelector("#web-bar-left-title") as HTMLElement;
  const rightTitleEl = container.querySelector("#web-bar-right-title") as HTMLElement;

  let currentMode: "single" | "split" = "single";
  let currentSplitRatio = 0.5;

  const setSplitRatio = (ratio: number) => {
    currentSplitRatio = Math.max(0.30, Math.min(0.70, ratio));
    const percent = currentSplitRatio * 100;
    if (leftPaneEl) leftPaneEl.style.width = `${percent}%`;
    if (rightPaneEl) rightPaneEl.style.width = `${100 - percent}%`;
  };

  const getSplitRatio = () => currentSplitRatio;

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

  const setSplitMode = (leftTitle: string, rightTitle: string, initialRatio?: number) => {
    currentMode = "split";
    singleBar.classList.add("hidden");
    singleBar.classList.remove("flex");
    splitBar.classList.remove("hidden");
    splitBar.classList.add("flex");
    if (initialRatio !== undefined) {
      setSplitRatio(initialRatio);
    }
    if (leftTitleEl) {
      leftTitleEl.textContent = leftTitle || "Left Pane";
      leftTitleEl.title = leftTitle || "";
    }
    if (rightTitleEl) {
      rightTitleEl.textContent = rightTitle || "Right Pane";
      rightTitleEl.title = rightTitle || "";
    }
  };

  interface ProgressBarController {
    element: HTMLElement | null;
    start: () => void;
    set: (progress: number) => void;
    finish: () => void;
    reset: () => void;
  }

  const createProgressBar = (barEl: HTMLElement | null): ProgressBarController => {
    let finishTimer: any = null;
    let resetTimer: any = null;
    let currentVal = 0;

    const reset = () => {
      if (!barEl) return;
      if (finishTimer) clearTimeout(finishTimer);
      if (resetTimer) clearTimeout(resetTimer);
      currentVal = 0;
      barEl.style.transition = "none";
      barEl.style.opacity = "0";
      barEl.style.width = "0%";
    };

    const start = () => {
      if (!barEl) return;
      if (finishTimer) clearTimeout(finishTimer);
      if (resetTimer) clearTimeout(resetTimer);
      currentVal = 0.12;
      barEl.style.transition = "none";
      barEl.style.opacity = "1";
      barEl.style.width = "0%";
      void barEl.offsetWidth; // Force layout recalculation
      barEl.style.transition = "width 0.22s cubic-bezier(0.1, 0.6, 0.2, 1), opacity 0.2s ease";
      barEl.style.width = "12%";
    };

    const set = (progress: number) => {
      if (!barEl) return;
      if (finishTimer) clearTimeout(finishTimer);
      if (resetTimer) clearTimeout(resetTimer);
      barEl.style.opacity = "1";
      barEl.style.transition = "width 0.22s cubic-bezier(0.1, 0.6, 0.2, 1), opacity 0.2s ease";

      const clamped = Math.max(0.12, Math.min(1.0, progress));
      if (clamped > currentVal) {
        currentVal = clamped;
      }
      barEl.style.width = `${Math.round(currentVal * 100)}%`;

      if (progress >= 1.0) {
        finish();
      }
    };

    const finish = () => {
      if (!barEl) return;
      if (finishTimer) clearTimeout(finishTimer);
      if (resetTimer) clearTimeout(resetTimer);
      currentVal = 1.0;
      barEl.style.opacity = "1";
      barEl.style.transition = "width 0.16s ease-out, opacity 0.24s ease-out";
      barEl.style.width = "100%";

      finishTimer = setTimeout(() => {
        if (barEl) barEl.style.opacity = "0";
        resetTimer = setTimeout(() => {
          if (barEl) {
            barEl.style.transition = "none";
            barEl.style.width = "0%";
            currentVal = 0;
          }
        }, 250);
      }, 200);
    };

    return { element: barEl, start, set, finish, reset };
  };

  const singleProgress = createProgressBar(container.querySelector("#web-bar-progress-single"));
  const leftProgress = createProgressBar(container.querySelector("#web-bar-progress-left"));
  const rightProgress = createProgressBar(container.querySelector("#web-bar-progress-right"));

  const getTargetProgress = (pane?: "single" | "left" | "right") => {
    if (pane === "left") return leftProgress;
    if (pane === "right") return rightProgress;
    return singleProgress;
  };

  return {
    element: container,
    setSingleMode,
    setSplitMode,
    setSplitRatio,
    getSplitRatio,
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
      singleProgress.reset();
      leftProgress.reset();
      rightProgress.reset();
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
    startProgress: (pane?: "single" | "left" | "right") => {
      if (!pane) {
        if (currentMode === "split") {
          leftProgress.start();
          rightProgress.start();
        } else {
          singleProgress.start();
        }
      } else {
        getTargetProgress(pane).start();
      }
    },
    setProgress: (progress: number, pane?: "single" | "left" | "right") => {
      if (!pane) {
        if (currentMode === "split") {
          leftProgress.set(progress);
          rightProgress.set(progress);
        } else {
          singleProgress.set(progress);
        }
      } else {
        getTargetProgress(pane).set(progress);
      }
    },
    finishProgress: (pane?: "single" | "left" | "right") => {
      if (!pane) {
        if (currentMode === "split") {
          leftProgress.finish();
          rightProgress.finish();
        } else {
          singleProgress.finish();
        }
      } else {
        getTargetProgress(pane).finish();
      }
    },
    resetProgress: (pane?: "single" | "left" | "right") => {
      if (!pane) {
        singleProgress.reset();
        leftProgress.reset();
        rightProgress.reset();
      } else {
        getTargetProgress(pane).reset();
      }
    },
  };
}
