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

import type { SplitPreset } from "../types";

export function createSplitPresetsSection(
  presets: SplitPreset[],
  onSpawn: (preset: SplitPreset) => void
) {
  const section = document.createElement("section");
  section.className = "w-full flex flex-col mt-2";

  section.innerHTML = `
    <div class="w-full flex flex-col gap-3">
      <!-- Section Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-[#ffabee] text-[20px]">splitscreen</span>
          <h2 class="text-base font-semibold text-[#e5e2e1] tracking-tight">
            Split View Tabs
          </h2>
        </div>
      </div>

      <!-- Presets List -->
      <div class="flex flex-col gap-2.5">
        ${presets
          .map((preset) => {
            return `
            <div
              data-preset-id="${preset.id}"
              class="preset-card flex items-center justify-between p-3.5 rounded-xl bg-[#202020] hover:bg-[#2a2a2a] border border-[#353535]/40 transition-all cursor-pointer shadow-sm group"
            >
              <div class="flex items-center gap-3.5">
                <div class="w-10 h-10 rounded-lg bg-[#0e0e0e] border border-[#353535] flex items-center justify-center text-[#ffb59e] group-hover:scale-105 group-hover:text-[#f85e2a] transition-all">
                  <span class="material-symbols-outlined text-[20px]">${preset.icon}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-sm font-semibold text-[#e5e2e1] group-hover:text-white transition-colors">
                    ${preset.title}
                  </span>
                  <span class="text-[11px] font-mono text-[#aa8a80]">
                    ${preset.left_url.replace("https://", "")} &nbsp;|&nbsp; ${preset.right_url.replace("https://", "")}
                  </span>
                </div>
              </div>

              <button
                type="button"
                class="btn-spawn px-3.5 py-1.5 rounded-lg bg-[#353535] text-[#e5e2e1] group-hover:bg-[#f85e2a] group-hover:text-[#521300] font-mono text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
              >
                <span>Spawn</span>
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
  `;

  // Attach click listeners to cards and spawn buttons
  section.querySelectorAll(".preset-card").forEach((card) => {
    const id = card.getAttribute("data-preset-id");
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;

    card.addEventListener("click", () => {
      onSpawn(preset);
    });
  });

  return section;
}
