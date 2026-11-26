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
import { deriveTitleFromInput } from "../utils/url";
import { escapeHtml } from "./dock_context_menu";

const SPLIT_ICONS = [
  "view_column",
  "splitscreen",
  "code",
  "terminal",
  "troubleshoot",
  "school",
  "article",
  "chat",
  "language",
] as const;

function normalizeSplitUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    return parsed.toString().replace(/\/$/, "") === withScheme.replace(/\/$/, "")
      ? withScheme
      : parsed.toString();
  } catch {
    return null;
  }
}

function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

export function createSplitPresetsSection(
  initialPresets: SplitPreset[],
  onSpawn: (preset: SplitPreset) => void,
  onPresetsChange: (presets: SplitPreset[]) => Promise<void> | void
): HTMLElement {
  const section = document.createElement("section");
  section.className = "w-full flex flex-col mt-2";

  let presets: SplitPreset[] = [...initialPresets];
  let isAdding = false;
  let selectedIcon: string = SPLIT_ICONS[0];
  let errorMessage = "";

  const render = () => {
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
          <button
            type="button"
            id="btn-toggle-add-split"
            class="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-[#e2bfb4] hover:text-[#ffb59e] border border-[#353535]/60 hover:border-[#f85e2a]/50 flex items-center gap-1 transition-all cursor-pointer"
          >
            <span class="material-symbols-outlined text-[15px]">${isAdding ? "close" : "add"}</span>
            <span>${isAdding ? "Cancel" : "Add Split View"}</span>
          </button>
        </div>

        <!-- Inline Add Split View Form -->
        ${
          isAdding
            ? `
          <form id="add-split-form" class="p-4 rounded-xl bg-[#1c1c1e] border border-[#353535] shadow-lg flex flex-col gap-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div class="flex flex-col gap-1">
                <label for="split-left-url" class="text-[11px] font-medium text-[#e2bfb4]">Left URL <span class="text-[#f85e2a]">*</span></label>
                <input
                  id="split-left-url"
                  type="text"
                  placeholder="https://github.com"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full px-3 py-2 rounded-lg bg-[#121214] border border-[#353535] focus:border-[#f85e2a] focus:ring-1 focus:ring-[#f85e2a] text-xs text-[#e5e2e1] placeholder-[#78655e] outline-none transition-colors"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label for="split-right-url" class="text-[11px] font-medium text-[#e2bfb4]">Right URL <span class="text-[#f85e2a]">*</span></label>
                <input
                  id="split-right-url"
                  type="text"
                  placeholder="https://docs.rs"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full px-3 py-2 rounded-lg bg-[#121214] border border-[#353535] focus:border-[#f85e2a] focus:ring-1 focus:ring-[#f85e2a] text-xs text-[#e5e2e1] placeholder-[#78655e] outline-none transition-colors"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
              <div class="flex flex-col gap-1">
                <label for="split-title" class="text-[11px] font-medium text-[#e2bfb4]">Title <span class="text-[#8e8a88] font-normal">(optional)</span></label>
                <input
                  id="split-title"
                  type="text"
                  placeholder="e.g. GitHub | Docs"
                  autocomplete="off"
                  class="w-full px-3 py-2 rounded-lg bg-[#121214] border border-[#353535] focus:border-[#f85e2a] focus:ring-1 focus:ring-[#f85e2a] text-xs text-[#e5e2e1] placeholder-[#78655e] outline-none transition-colors"
                />
              </div>

              <div class="flex flex-col gap-1">
                <span class="text-[11px] font-medium text-[#e2bfb4]">Icon</span>
                <div class="flex items-center gap-1 flex-wrap">
                  ${SPLIT_ICONS.map((icon) => {
                    const active = icon === selectedIcon;
                    return `
                      <button
                        type="button"
                        data-split-icon="${icon}"
                        title="${icon}"
                        class="split-icon-option w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                          active
                            ? "bg-[#f85e2a]/20 border-[#f85e2a] text-[#ffb59e]"
                            : "bg-[#121214] border-[#353535] text-[#8e8a88] hover:text-[#e5e2e1] hover:border-[#525252]"
                        }"
                      >
                        <span class="material-symbols-outlined text-[16px]">${icon}</span>
                      </button>
                    `;
                  }).join("")}
                </div>
              </div>
            </div>

            ${
              errorMessage
                ? `<p class="text-[11px] text-red-400 font-medium">${escapeHtml(errorMessage)}</p>`
                : ""
            }

            <div class="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                id="btn-cancel-add-split"
                class="px-3 py-1.5 rounded-lg bg-[#2a2a2e] hover:bg-[#35353a] text-[#e5e2e1] text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="px-3.5 py-1.5 rounded-lg bg-[#f85e2a] hover:bg-[#ff7345] text-[#521300] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span class="material-symbols-outlined text-[15px]">add</span>
                <span>Save Split View</span>
              </button>
            </div>
          </form>
        `
            : ""
        }

        <!-- Split View Tabs List -->
        <div class="flex flex-col gap-2.5">
          ${
            presets.length === 0
              ? `
            <div class="flex items-center justify-between p-4 rounded-xl bg-[#202020]/70 border border-dashed border-[#353535] text-[#aa8a80]">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-[#141416] border border-[#353535]/70 flex items-center justify-center text-[#8e8a88]">
                  <span class="material-symbols-outlined text-[18px]">splitscreen</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-xs font-medium text-[#e5e2e1]">No split view tabs yet</span>
                  <span class="text-[11px] text-[#8e8a88]">Add two URLs to launch them side-by-side in one click.</span>
                </div>
              </div>
              ${
                !isAdding
                  ? `
                <button
                  type="button"
                  id="btn-empty-add-split"
                  class="px-3 py-1.5 rounded-lg bg-[#2a2a2e] hover:bg-[#f85e2a] text-[#e5e2e1] hover:text-[#521300] text-xs font-medium transition-all flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span class="material-symbols-outlined text-[14px]">add</span>
                  <span>Add</span>
                </button>
              `
                  : ""
              }
            </div>
          `
              : presets
                  .map((preset) => {
                    return `
                  <div
                    data-preset-id="${escapeHtml(preset.id)}"
                    class="preset-card flex items-center justify-between p-3.5 rounded-xl bg-[#202020] hover:bg-[#2a2a2a] border border-[#353535]/40 transition-all cursor-pointer shadow-sm group"
                  >
                    <div class="flex items-center gap-3.5 min-w-0">
                      <div class="w-10 h-10 rounded-lg bg-[#0e0e0e] border border-[#353535] flex items-center justify-center text-[#ffb59e] group-hover:scale-105 group-hover:text-[#f85e2a] transition-all shrink-0">
                        <span class="material-symbols-outlined text-[20px]">${escapeHtml(preset.icon || "splitscreen")}</span>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-sm font-semibold text-[#e5e2e1] group-hover:text-white transition-colors truncate">
                          ${escapeHtml(preset.title)}
                        </span>
                        <span class="text-[11px] text-[#aa8a80] truncate">
                          ${escapeHtml(formatDisplayUrl(preset.left_url))} &nbsp;|&nbsp; ${escapeHtml(formatDisplayUrl(preset.right_url))}
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        type="button"
                        data-delete-preset-id="${escapeHtml(preset.id)}"
                        title="Remove split view"
                        aria-label="Remove split view"
                        class="btn-delete-preset w-8 h-8 rounded-lg flex items-center justify-center text-[#8e8a88] hover:text-red-400 hover:bg-[#353535]/70 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all cursor-pointer"
                      >
                        <span class="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                      <button
                        type="button"
                        class="btn-spawn px-3.5 py-1.5 rounded-lg bg-[#353535] text-[#e5e2e1] group-hover:bg-[#f85e2a] group-hover:text-[#521300] text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <span>Spawn</span>
                        <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                `;
                  })
                  .join("")
          }
        </div>
      </div>
    `;

    // Toggle add form
    section.querySelector("#btn-toggle-add-split")?.addEventListener("click", () => {
      isAdding = !isAdding;
      errorMessage = "";
      render();
      if (isAdding) {
        (section.querySelector("#split-left-url") as HTMLInputElement | null)?.focus();
      }
    });

    section.querySelector("#btn-empty-add-split")?.addEventListener("click", () => {
      isAdding = true;
      errorMessage = "";
      render();
      (section.querySelector("#split-left-url") as HTMLInputElement | null)?.focus();
    });

    section.querySelector("#btn-cancel-add-split")?.addEventListener("click", () => {
      isAdding = false;
      errorMessage = "";
      render();
    });

    // Icon selection
    section.querySelectorAll(".split-icon-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const icon = btn.getAttribute("data-split-icon");
        if (!icon) return;
        selectedIcon = icon;
        section.querySelectorAll(".split-icon-option").forEach((opt) => {
          const isSelected = opt.getAttribute("data-split-icon") === selectedIcon;
          opt.className = `split-icon-option w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
            isSelected
              ? "bg-[#f85e2a]/20 border-[#f85e2a] text-[#ffb59e]"
              : "bg-[#121214] border-[#353535] text-[#8e8a88] hover:text-[#e5e2e1] hover:border-[#525252]"
          }`;
        });
      });
    });

    // Form submit
    const form = section.querySelector("#add-split-form") as HTMLFormElement | null;
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const leftInput = (section.querySelector("#split-left-url") as HTMLInputElement | null)?.value ?? "";
      const rightInput = (section.querySelector("#split-right-url") as HTMLInputElement | null)?.value ?? "";
      const titleInput = (section.querySelector("#split-title") as HTMLInputElement | null)?.value.trim() ?? "";

      const leftUrl = normalizeSplitUrl(leftInput);
      const rightUrl = normalizeSplitUrl(rightInput);

      if (!leftUrl || !rightUrl) {
        errorMessage = "Please enter valid URLs for both the left and right panes.";
        render();
        const leftEl = section.querySelector("#split-left-url") as HTMLInputElement | null;
        const rightEl = section.querySelector("#split-right-url") as HTMLInputElement | null;
        const titleEl = section.querySelector("#split-title") as HTMLInputElement | null;
        if (leftEl) leftEl.value = leftInput;
        if (rightEl) rightEl.value = rightInput;
        if (titleEl) titleEl.value = titleInput;
        (!leftUrl ? leftEl : rightEl)?.focus();
        return;
      }

      const derivedTitle = `${deriveTitleFromInput(leftUrl)} | ${deriveTitleFromInput(rightUrl)}`;
      const newPreset: SplitPreset = {
        id: `split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: titleInput || derivedTitle,
        icon: selectedIcon,
        left_url: leftUrl,
        right_url: rightUrl,
      };

      presets = [...presets, newPreset];
      isAdding = false;
      errorMessage = "";
      selectedIcon = SPLIT_ICONS[0];
      render();
      await onPresetsChange(presets);
    });

    // Attach click listeners to cards
    section.querySelectorAll(".preset-card").forEach((card) => {
      const id = card.getAttribute("data-preset-id");
      const preset = presets.find((p) => p.id === id);
      if (!preset) return;

      card.addEventListener("click", () => {
        onSpawn(preset);
      });
    });

    // Attach click listeners to delete buttons
    section.querySelectorAll(".btn-delete-preset").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-delete-preset-id");
        if (!id) return;
        presets = presets.filter((p) => p.id !== id);
        render();
        await onPresetsChange(presets);
      });
    });
  };

  render();
  return section;
}
