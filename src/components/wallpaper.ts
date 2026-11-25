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
  cycleButton: HTMLButtonElement;
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

export function createHomepageWallpaper(): HomepageWallpaperController {
  const layerElement = document.createElement("div");
  layerElement.id = "homepage-wallpaper-layer";
  layerElement.className =
    "absolute inset-0 pointer-events-none overflow-hidden z-0 hidden select-none";

  const imageSurface = document.createElement("div");
  imageSurface.className =
    "w-full h-full bg-cover bg-center bg-no-repeat transition-opacity duration-300";
  layerElement.appendChild(imageSurface);

  const cycleButton = document.createElement("button");
  cycleButton.id = "btn-next-wallpaper";
  cycleButton.type = "button";
  cycleButton.title = "Next Wallpaper";
  cycleButton.className =
    "hidden absolute bottom-4 right-4 z-20 px-2.5 py-1.5 rounded-xl bg-[#18181b]/75 hover:bg-[#222227]/90 backdrop-blur-md border border-[#2e2e34] hover:border-[#42424b] text-[#e2bfb4] hover:text-[#e5e2e1] text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-lg select-none";
  cycleButton.innerHTML = `
    <span class="material-symbols-outlined text-[15px] text-[#f85e2a]">wallpaper</span>
    <span>Next</span>
  `;

  let currentFolder = "";
  let currentOrder: WallpaperOrder = "randomized";
  let rawPaths: string[] = [];
  let imagePaths: string[] = [];
  let currentIndex = -1;
  let loadSeq = 0;

  function applyTransparency(transparency: number) {
    const opacity = (100 - clampTransparency(transparency)) / 100;
    imageSurface.style.opacity = opacity.toFixed(2);
  }

  async function showImageAt(index: number) {
    if (imagePaths.length === 0) {
      layerElement.classList.add("hidden");
      cycleButton.classList.add("hidden");
      imageSurface.style.backgroundImage = "";
      return;
    }

    const seq = ++loadSeq;
    const normalizedIdx = ((index % imagePaths.length) + imagePaths.length) % imagePaths.length;
    currentIndex = normalizedIdx;
    const targetPath = imagePaths[normalizedIdx];

    try {
      const dataUrl = await tauriIpc.loadWallpaperImage(targetPath);
      if (seq !== loadSeq) return;
      imageSurface.style.backgroundImage = `url("${dataUrl}")`;
      layerElement.classList.remove("hidden");
      if (imagePaths.length > 1) {
        cycleButton.classList.remove("hidden");
      } else {
        cycleButton.classList.add("hidden");
      }
    } catch (e) {
      console.warn("Failed to load wallpaper image:", e);
      if (seq === loadSeq) {
        layerElement.classList.add("hidden");
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

  cycleButton.addEventListener("click", () => {
    if (imagePaths.length <= 1) return;
    if (currentOrder === "randomized") {
      void showImageAt(pickNextRandomIndex());
    } else {
      void showImageAt(currentIndex + 1);
    }
  });

  async function applySettings(settings?: WallpaperSettings) {
    const folder = settings?.folder_path?.trim() || "";
    const transparency = clampTransparency(settings?.transparency);
    const order = normalizeOrder(settings?.order);
    applyTransparency(transparency);

    if (!folder) {
      currentFolder = "";
      currentOrder = order;
      rawPaths = [];
      imagePaths = [];
      currentIndex = -1;
      loadSeq++;
      layerElement.classList.add("hidden");
      cycleButton.classList.add("hidden");
      imageSurface.style.backgroundImage = "";
      return;
    }

    const folderChanged = folder !== currentFolder;
    const orderChanged = order !== currentOrder;

    if (folderChanged || rawPaths.length === 0) {
      currentFolder = folder;
      currentOrder = order;
      const listed = await tauriIpc.listWallpaperImages(folder);
      if (folder !== currentFolder) return;
      rawPaths = listed;
      imagePaths = sortPaths(rawPaths, order);
      if (imagePaths.length === 0) {
        currentIndex = -1;
        layerElement.classList.add("hidden");
        cycleButton.classList.add("hidden");
        imageSurface.style.backgroundImage = "";
        return;
      }
      const initialIndex =
        order === "randomized" ? Math.floor(Math.random() * imagePaths.length) : 0;
      await showImageAt(initialIndex);
    } else if (orderChanged) {
      currentOrder = order;
      imagePaths = sortPaths(rawPaths, order);
      if (imagePaths.length > 0) {
        const nextIdx =
          order === "randomized" ? pickNextRandomIndex() : 0;
        await showImageAt(nextIdx);
      }
    }
  }

  return {
    layerElement,
    cycleButton,
    applySettings,
  };
}
