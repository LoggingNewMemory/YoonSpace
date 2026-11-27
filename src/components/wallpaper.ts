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
import type { WallpaperOrder, WallpaperSettings } from "../types";

export interface HomepageWallpaperController {
  layerElement: HTMLElement;
  controlsElement: HTMLElement;
  applySettings: (settings?: WallpaperSettings) => Promise<void>;
}

function clampTransparency(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeOrder(order: string | undefined): WallpaperOrder {
  if (order === "a_z" || order === "z_a" || order === "randomized") {
    return order;
  }
  return "randomized";
}

function normalizeIntervalSecs(secs: number | undefined): number {
  if (secs === 60 || secs === 300 || secs === 1800 || secs === 3600) {
    return secs;
  }
  return 300;
}

function fileNameOf(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function sortPaths(paths: string[], order: WallpaperOrder): string[] {
  const copy = [...paths];
  copy.sort((a, b) =>
    fileNameOf(a).localeCompare(fileNameOf(b), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
  if (order === "z_a") {
    copy.reverse();
  }
  return copy;
}

export function createHomepageWallpaper(
  onTransparencyChange?: (transparency: number, persist: boolean) => void
): HomepageWallpaperController {
  const layerElement = document.createElement("div");
  layerElement.id = "homepage-wallpaper-layer";
  layerElement.className =
    "absolute inset-0 pointer-events-none overflow-hidden z-0 hidden select-none";

  const surfaceA = document.createElement("div");
  surfaceA.className =
    "absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-in-out opacity-0";
  const surfaceB = document.createElement("div");
  surfaceB.className =
    "absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-in-out opacity-0";
  layerElement.appendChild(surfaceA);
  layerElement.appendChild(surfaceB);

  // Floating bottom-right controls container
  const controlsElement = document.createElement("div");
  controlsElement.id = "homepage-wallpaper-controls";
  controlsElement.className =
    "hidden absolute bottom-4 right-4 z-20 flex items-center gap-2 select-none";

  // Transparency control + popover
  const transparencyWrapper = document.createElement("div");
  transparencyWrapper.className = "relative";

  const transparencyBtn = document.createElement("button");
  transparencyBtn.id = "btn-wallpaper-transparency";
  transparencyBtn.type = "button";
  transparencyBtn.title = "Adjust Wallpaper Transparency";
  transparencyBtn.className =
    "p-1.5 rounded-xl bg-[#18181b]/80 hover:bg-[#222227]/95 backdrop-blur-md border border-[#2e2e34] hover:border-[#42424b] text-[#e2bfb4] hover:text-[#e5e2e1] flex items-center justify-center transition-colors cursor-pointer shadow-lg";
  transparencyBtn.innerHTML = `
    <span class="material-symbols-outlined text-[16px] text-[#f85e2a]">opacity</span>
  `;

  const transparencyPopover = document.createElement("div");
  transparencyPopover.id = "homepage-wallpaper-transparency-popover";
  transparencyPopover.className =
    "hidden absolute bottom-full right-0 mb-2 w-56 p-3 rounded-xl bg-[#18181b]/95 backdrop-blur-md border border-[#2e2e34] shadow-2xl flex flex-col gap-2";
  transparencyPopover.innerHTML = `
    <div class="flex items-center justify-between text-[11px]">
      <span class="font-semibold text-[#e5e2e1]">Transparency</span>
      <span id="homepage-wallpaper-popover-val" class="font-mono font-bold text-[#ffb59e]">50%</span>
    </div>
    <input
      type="range"
      id="homepage-wallpaper-transparency-slider"
      min="0"
      max="100"
      step="1"
      value="50"
      class="w-full accent-[#f85e2a] cursor-pointer"
    />
  `;

  transparencyWrapper.appendChild(transparencyPopover);
  transparencyWrapper.appendChild(transparencyBtn);

  const cycleButton = document.createElement("button");
  cycleButton.id = "btn-next-wallpaper";
  cycleButton.type = "button";
  cycleButton.title = "Next Wallpaper";
  cycleButton.className =
    "hidden px-2.5 py-1.5 rounded-xl bg-[#18181b]/80 hover:bg-[#222227]/95 backdrop-blur-md border border-[#2e2e34] hover:border-[#42424b] text-[#e2bfb4] hover:text-[#e5e2e1] text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-lg";
  cycleButton.innerHTML = `
    <span class="material-symbols-outlined text-[15px] text-[#f85e2a]">wallpaper</span>
    <span>Next</span>
  `;

  controlsElement.appendChild(transparencyWrapper);
  controlsElement.appendChild(cycleButton);

  const popoverVal = transparencyPopover.querySelector(
    "#homepage-wallpaper-popover-val"
  ) as HTMLElement;
  const popoverSlider = transparencyPopover.querySelector(
    "#homepage-wallpaper-transparency-slider"
  ) as HTMLInputElement;

  let currentFolder = "";
  let currentOrder: WallpaperOrder = "randomized";
  let currentIntervalSecs = 0;
  let rawPaths: string[] = [];
  let imagePaths: string[] = [];
  let currentIndex = -1;
  let activeSurface: "A" | "B" = "A";
  let loadSeq = 0;
  let autoTimerId: ReturnType<typeof setInterval> | null = null;

  function applyTransparencyUI(transparency: number) {
    const clamped = clampTransparency(transparency);
    const opacity = (100 - clamped) / 100;
    layerElement.style.opacity = opacity.toFixed(2);
    if (popoverVal) popoverVal.textContent = `${clamped}%`;
    if (popoverSlider) popoverSlider.value = String(clamped);
  }

  function clearAutoTimer() {
    if (autoTimerId !== null) {
      clearInterval(autoTimerId);
      autoTimerId = null;
    }
  }

  function resetAutoTimer() {
    clearAutoTimer();
    if (currentIntervalSecs <= 0 || imagePaths.length <= 1) return;
    autoTimerId = setInterval(() => {
      const mainCanvas = layerElement.closest("#main-canvas");
      if (!layerElement.isConnected || mainCanvas?.classList.contains("hidden")) {
        return;
      }
      advanceWallpaper();
    }, currentIntervalSecs * 1000);
  }

  function clearSurfaces() {
    surfaceA.style.opacity = "0";
    surfaceB.style.opacity = "0";
    surfaceA.style.backgroundImage = "";
    surfaceB.style.backgroundImage = "";
  }

  function buildWallpaperProtocolUrl(filePath: string): string {
    return `wallpaper://localhost/?path=${encodeURIComponent(filePath)}`;
  }

  async function preloadImage(imageUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = new Image();
      let settled = false;
      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      probe.onload = () => {
        if (typeof probe.decode === "function") {
          probe.decode().then(() => finish(true)).catch(() => finish(true));
        } else {
          finish(true);
        }
      };
      probe.onerror = () => finish(false);
      probe.src = imageUrl;
    });
  }

  async function showImageAt(index: number) {
    if (imagePaths.length === 0) {
      layerElement.classList.add("hidden");
      controlsElement.classList.add("hidden");
      cycleButton.classList.add("hidden");
      transparencyPopover.classList.add("hidden");
      clearSurfaces();
      clearAutoTimer();
      return;
    }

    const seq = ++loadSeq;
    const normalizedIdx = ((index % imagePaths.length) + imagePaths.length) % imagePaths.length;
    currentIndex = normalizedIdx;
    const targetPath = imagePaths[normalizedIdx];

    try {
      let imageUrl = buildWallpaperProtocolUrl(targetPath);
      const protocolOk = await preloadImage(imageUrl);
      if (!protocolOk) {
        imageUrl = await tauriIpc.loadWallpaperImage(targetPath);
        await preloadImage(imageUrl);
      }
      if (seq !== loadSeq) return;

      const incoming = activeSurface === "A" ? surfaceB : surfaceA;
      const outgoing = activeSurface === "A" ? surfaceA : surfaceB;

      incoming.style.backgroundImage = `url("${imageUrl.replace(/"/g, '\\"')}")`;
      layerElement.classList.remove("hidden");
      controlsElement.classList.remove("hidden");
      if (imagePaths.length > 1) {
        cycleButton.classList.remove("hidden");
      } else {
        cycleButton.classList.add("hidden");
      }

      // Trigger smooth crossfade on next animation frame
      requestAnimationFrame(() => {
        if (seq !== loadSeq) return;
        incoming.style.opacity = "1";
        outgoing.style.opacity = "0";
        activeSurface = activeSurface === "A" ? "B" : "A";
      });
    } catch (e) {
      console.warn("Failed to load wallpaper image:", e);
      if (seq === loadSeq) {
        layerElement.classList.add("hidden");
        controlsElement.classList.add("hidden");
      }
    }
  }

  function pickNextRandomIndex(): number {
    if (imagePaths.length <= 1) return 0;
    let next = Math.floor(Math.random() * imagePaths.length);
    if (next === currentIndex) {
      next = (next + 1) % imagePaths.length;
    }
    return next;
  }

  function advanceWallpaper() {
    if (imagePaths.length <= 1) return;
    if (currentOrder === "randomized") {
      void showImageAt(pickNextRandomIndex());
    } else {
      void showImageAt(currentIndex + 1);
    }
  }

  cycleButton.addEventListener("click", () => {
    advanceWallpaper();
    resetAutoTimer();
  });

  transparencyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    transparencyPopover.classList.toggle("hidden");
  });

  transparencyPopover.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  document.addEventListener("click", (e) => {
    if (!transparencyWrapper.contains(e.target as Node)) {
      transparencyPopover.classList.add("hidden");
    }
  });

  popoverSlider.addEventListener("input", () => {
    const val = clampTransparency(Number(popoverSlider.value));
    applyTransparencyUI(val);
    onTransparencyChange?.(val, false);
  });

  popoverSlider.addEventListener("change", () => {
    const val = clampTransparency(Number(popoverSlider.value));
    applyTransparencyUI(val);
    onTransparencyChange?.(val, true);
  });

  async function applySettings(settings?: WallpaperSettings) {
    const folder = settings?.folder_path?.trim() || "";
    const transparency = clampTransparency(settings?.transparency);
    const order = normalizeOrder(settings?.order);
    const intervalSecs = normalizeIntervalSecs(settings?.change_interval_secs);

    applyTransparencyUI(transparency);

    if (!folder) {
      currentFolder = "";
      currentOrder = order;
      currentIntervalSecs = intervalSecs;
      rawPaths = [];
      imagePaths = [];
      currentIndex = -1;
      loadSeq++;
      clearAutoTimer();
      layerElement.classList.add("hidden");
      controlsElement.classList.add("hidden");
      cycleButton.classList.add("hidden");
      transparencyPopover.classList.add("hidden");
      clearSurfaces();
      return;
    }

    const folderChanged = folder !== currentFolder;
    const orderChanged = order !== currentOrder;
    const intervalChanged = intervalSecs !== currentIntervalSecs;
    currentIntervalSecs = intervalSecs;

    if (folderChanged || rawPaths.length === 0) {
      currentFolder = folder;
      currentOrder = order;
      const listed = await tauriIpc.listWallpaperImages(folder);
      if (folder !== currentFolder) return;
      rawPaths = listed;
      imagePaths = sortPaths(rawPaths, order);
      if (imagePaths.length === 0) {
        currentIndex = -1;
        clearAutoTimer();
        layerElement.classList.add("hidden");
        controlsElement.classList.add("hidden");
        cycleButton.classList.add("hidden");
        clearSurfaces();
        return;
      }
      const initialIndex =
        order === "randomized" ? Math.floor(Math.random() * imagePaths.length) : 0;
      await showImageAt(initialIndex);
      resetAutoTimer();
    } else if (orderChanged) {
      currentOrder = order;
      imagePaths = sortPaths(rawPaths, order);
      if (imagePaths.length > 0) {
        const nextIdx = order === "randomized" ? pickNextRandomIndex() : 0;
        await showImageAt(nextIdx);
        resetAutoTimer();
      }
    } else if (intervalChanged) {
      resetAutoTimer();
    }
  }

  return {
    layerElement,
    controlsElement,
    applySettings,
  };
}
