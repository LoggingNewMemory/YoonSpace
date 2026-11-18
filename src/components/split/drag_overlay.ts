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

import type { SplitBounds } from "../../types";

export interface DragSplitOverlayController {
  element: HTMLElement;
  show(tabTitle: string, bounds: SplitBounds): void;
  hide(): void;
  updateBounds(bounds: SplitBounds): void;
  updateDragPosition(x: number, y: number, bounds: SplitBounds): "left" | "right" | "none";
  getActiveZone(): "left" | "right" | "none";
  reset(): void;
}

export function createDragSplitOverlay(): DragSplitOverlayController {
  const overlay = document.createElement("div");
  overlay.id = "drag-split-overlay";
  overlay.className =
    "hidden fixed z-50 p-4 flex gap-4 pointer-events-none select-none";

  overlay.innerHTML = `
    <!-- Left Snap Zone -->
    <div
      id="drag-drop-left"
      class="flex-1 h-full rounded-2xl border-2 border-dashed border-[#f85e2a]/30 bg-[#141416]/85 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#aa8a80] opacity-40"
    >
      <div class="w-16 h-16 rounded-2xl bg-[#222224] flex items-center justify-center text-[#ffb59e] shadow-lg">
        <span class="material-symbols-outlined text-4xl">dock_to_left</span>
      </div>
      <div class="text-center px-4">
        <div class="text-lg font-semibold text-[#e5e2e1]">Tile Left</div>
        <div id="drag-drop-left-subtitle" class="text-xs text-[#a09e9d] mt-1 max-w-xs truncate">
          Snap to left half of screen
        </div>
      </div>
    </div>

    <!-- Right Snap Zone -->
    <div
      id="drag-drop-right"
      class="flex-1 h-full rounded-2xl border-2 border-dashed border-[#f85e2a]/30 bg-[#141416]/85 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#aa8a80] opacity-40"
    >
      <div class="w-16 h-16 rounded-2xl bg-[#222224] flex items-center justify-center text-[#ffb59e] shadow-lg">
        <span class="material-symbols-outlined text-4xl">dock_to_right</span>
      </div>
      <div class="text-center px-4">
        <div class="text-lg font-semibold text-[#e5e2e1]">Tile Right</div>
        <div id="drag-drop-right-subtitle" class="text-xs text-[#a09e9d] mt-1 max-w-xs truncate">
          Snap to right half of screen
        </div>
      </div>
    </div>
  `;

  const leftZone = overlay.querySelector("#drag-drop-left") as HTMLElement;
  const rightZone = overlay.querySelector("#drag-drop-right") as HTMLElement;
  const leftSubtitle = overlay.querySelector("#drag-drop-left-subtitle") as HTMLElement;
  const rightSubtitle = overlay.querySelector("#drag-drop-right-subtitle") as HTMLElement;

  let activeZone: "left" | "right" | "none" = "none";

  function setZoneHover(zone: HTMLElement | null, hovered: boolean) {
    if (!zone) return;
    if (hovered) {
      zone.className =
        "flex-1 h-full rounded-2xl border-2 border-solid border-[#f85e2a] bg-[#f85e2a]/15 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#ffb59e] opacity-100 shadow-[0_0_30px_rgba(248,94,42,0.3)]";
    } else {
      zone.className =
        "flex-1 h-full rounded-2xl border-2 border-dashed border-[#f85e2a]/30 bg-[#141416]/85 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#aa8a80] opacity-40";
    }
  }

  function updateBounds(bounds: SplitBounds) {
    overlay.style.left = `${bounds.x}px`;
    overlay.style.top = `${bounds.y}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
  }

  function reset() {
    activeZone = "none";
    setZoneHover(leftZone, false);
    setZoneHover(rightZone, false);
  }

  function show(tabTitle: string, bounds: SplitBounds) {
    reset();
    updateBounds(bounds);
    if (leftSubtitle) leftSubtitle.textContent = `Tile "${tabTitle}" on the left`;
    if (rightSubtitle) rightSubtitle.textContent = `Tile "${tabTitle}" on the right`;
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  }

  function hide() {
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
    reset();
  }

  function updateDragPosition(x: number, y: number, bounds: SplitBounds): "left" | "right" | "none" {
    if (overlay.classList.contains("hidden")) return "none";

    let newZone: "left" | "right" | "none" = "none";
    if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
      newZone = x < bounds.x + bounds.width / 2 ? "left" : "right";
    }

    if (newZone !== activeZone) {
      activeZone = newZone;
      setZoneHover(leftZone, newZone === "left");
      setZoneHover(rightZone, newZone === "right");
    }

    return activeZone;
  }

  return {
    element: overlay,
    show,
    hide,
    updateBounds,
    updateDragPosition,
    getActiveZone: () => activeZone,
    reset,
  };
}
