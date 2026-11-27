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
import type { BookmarkItem, MinimizedTab } from "../types";
import {
  getInlineCompletion,
  getLocalSuggestions,
  isLikelyUrlInput,
  removeSearchHistory,
  type AutocompleteItem,
} from "../utils/autocomplete";

export interface AutocompleteContext {
  getBookmarks?: () => BookmarkItem[];
  getTabs?: () => MinimizedTab[];
  getEngineId?: () => string;
  canShowDropdown?: () => boolean;
  onSelectTab?: (tabId: string) => void;
}

export interface SearchAutocompleteOptions {
  input: HTMLInputElement;
  anchor: HTMLElement;
  context?: AutocompleteContext;
  onSelect: (value: string, item?: AutocompleteItem) => void;
  onSyncClear?: () => void;
}

export interface SearchAutocompleteController {
  close: () => void;
  refresh: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightMatch(text: string, query: string): string {
  const q = query.trim();
  if (!q) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return `${escapeHtml(before)}<span class="text-[#ffb59e] font-semibold">${escapeHtml(match)}</span>${escapeHtml(after)}`;
}

function iconForKind(kind: AutocompleteItem["kind"]): string {
  switch (kind) {
    case "history":
      return "history";
    case "bookmark":
      return "star";
    case "tab":
      return "tab";
    case "search":
    default:
      return "search";
  }
}

export function attachSearchAutocomplete(
  options: SearchAutocompleteOptions
): SearchAutocompleteController {
  const { input, anchor, context, onSelect, onSyncClear } = options;

  anchor.style.position = anchor.style.position || "relative";

  const dropdown = document.createElement("div");
  dropdown.className =
    "hidden absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl bg-[#1b1b1f]/98 backdrop-blur-xl border border-[#35353c] shadow-[0_14px_36px_rgba(0,0,0,0.65)] overflow-hidden py-1.5 select-none";
  anchor.appendChild(dropdown);

  let items: AutocompleteItem[] = [];
  let activeIndex = -1;
  let typedQuery = "";
  let remoteTimer: number | null = null;
  let remoteReqSeq = 0;
  let lastKeyWasDelete = false;
  let isApplyingPreview = false;

  function canShow(): boolean {
    return context?.canShowDropdown ? context.canShowDropdown() : true;
  }

  function close() {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    activeIndex = -1;
  }

  function render() {
    if (!canShow() || items.length === 0 || document.activeElement !== input) {
      close();
      return;
    }

    dropdown.innerHTML = items
      .map((item, idx) => {
        const isActive = idx === activeIndex;
        const rowClass = isActive
          ? "bg-[#2f2f38] text-white border-l-2 border-[#f85e2a]"
          : "text-[#d9d5d4] hover:bg-[#24242a] hover:text-white border-l-2 border-transparent";
        const iconName = iconForKind(item.kind);
        const iconColor =
          item.kind === "bookmark"
            ? "text-[#f85e2a]"
            : item.kind === "tab"
            ? "text-[#ffabee]"
            : item.kind === "history"
            ? "text-[#ffb59e]"
            : "text-[#9c9a98]";

        const badgeHtml =
          item.kind === "tab"
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#7a2472]/35 text-[#ffabee] border border-[#ffabee]/20 shrink-0">Switch to tab</span>`
            : item.kind === "bookmark"
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#f85e2a]/15 text-[#ffb59e] border border-[#f85e2a]/25 shrink-0">Bookmark</span>`
            : "";

        const removeHtml =
          item.kind === "history"
            ? `<button type="button" data-remove-idx="${idx}" title="Remove from history" class="btn-ac-remove w-5 h-5 rounded flex items-center justify-center text-[#7a7674] hover:text-[#ffb4ab] hover:bg-[#3a2424] transition-colors shrink-0 cursor-pointer"><span class="material-symbols-outlined text-[13px]">close</span></button>`
            : "";

        return `
          <div
            data-ac-idx="${idx}"
            class="ac-row flex items-center justify-between gap-2.5 px-3 py-1.5 cursor-pointer transition-colors ${rowClass}"
          >
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <span class="material-symbols-outlined text-[16px] shrink-0 ${iconColor}">${iconName}</span>
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="text-xs truncate">${highlightMatch(item.title, typedQuery)}</span>
                ${
                  item.subtitle && item.subtitle !== item.title
                    ? `<span class="text-[11px] text-[#8e8a88] font-mono truncate">— ${escapeHtml(item.subtitle)}</span>`
                    : ""
                }
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              ${badgeHtml}
              ${removeHtml}
            </div>
          </div>
        `;
      })
      .join("");

    dropdown.querySelectorAll(".ac-row").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        const idx = Number(row.getAttribute("data-ac-idx"));
        if (!Number.isNaN(idx)) {
          activeIndex = idx;
          updateRowHighlight();
        }
      });

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const target = e.target as HTMLElement;
        const removeBtn = target.closest(".btn-ac-remove") as HTMLElement | null;
        if (removeBtn) {
          const idx = Number(removeBtn.getAttribute("data-remove-idx"));
          const targetItem = items[idx];
          if (targetItem) {
            removeSearchHistory(targetItem.value);
            updateSuggestions(false);
          }
          return;
        }
        const idx = Number(row.getAttribute("data-ac-idx"));
        const selected = items[idx];
        if (selected) {
          commitSelection(selected);
        }
      });
    });

    dropdown.classList.remove("hidden");
  }

  function updateRowHighlight() {
    dropdown.querySelectorAll(".ac-row").forEach((row, idx) => {
      if (idx === activeIndex) {
        row.classList.remove("text-[#d9d5d4]", "hover:bg-[#24242a]", "hover:text-white", "border-transparent");
        row.classList.add("bg-[#2f2f38]", "text-white", "border-[#f85e2a]");
        (row as HTMLElement).scrollIntoView({ block: "nearest" });
      } else {
        row.classList.remove("bg-[#2f2f38]", "text-white", "border-[#f85e2a]");
        row.classList.add("text-[#d9d5d4]", "hover:bg-[#24242a]", "hover:text-white", "border-transparent");
      }
    });
  }

  function commitSelection(item: AutocompleteItem) {
    if (item.kind === "tab" && item.tabId && context?.onSelectTab) {
      close();
      input.blur();
      context.onSelectTab(item.tabId);
      return;
    }
    isApplyingPreview = true;
    input.value = item.value;
    typedQuery = item.value;
    input.setSelectionRange(item.value.length, item.value.length);
    isApplyingPreview = false;
    onSyncClear?.();
    close();
    input.blur();
    onSelect(item.value, item);
  }

  function mergeRemoteSuggestions(querySnapshot: string, remoteStrings: string[]) {
    if (querySnapshot !== typedQuery.trim() || document.activeElement !== input) {
      return;
    }

    const bookmarks = context?.getBookmarks?.() || [];
    const tabs = context?.getTabs?.() || [];
    const local = getLocalSuggestions(querySnapshot, bookmarks, tabs, 5);
    const seen = new Set(local.map((i) => i.title.toLowerCase()));
    const seenValues = new Set(local.map((i) => i.value.toLowerCase()));

    const remoteItems: AutocompleteItem[] = [];
    for (const s of remoteStrings) {
      const lower = s.toLowerCase();
      if (seen.has(lower) || seenValues.has(lower)) continue;
      seen.add(lower);
      remoteItems.push({
        id: `search:${s}`,
        value: s,
        title: s,
        kind: "search",
        score: 50,
      });
    }

    const prevSelectedId = activeIndex >= 0 && items[activeIndex] ? items[activeIndex].id : null;
    items = [...local, ...remoteItems].slice(0, 8);
    activeIndex = prevSelectedId ? items.findIndex((i) => i.id === prevSelectedId) : -1;
    render();
  }

  function updateSuggestions(allowInlineComplete: boolean) {
    const raw = input.value;
    typedQuery = raw;
    const trimmed = raw.trim();

    if (remoteTimer !== null) {
      window.clearTimeout(remoteTimer);
      remoteTimer = null;
    }

    if (!trimmed) {
      items = [];
      close();
      return;
    }

    const bookmarks = context?.getBookmarks?.() || [];
    const tabs = context?.getTabs?.() || [];
    const local = getLocalSuggestions(trimmed, bookmarks, tabs, 5);
    items = local;
    activeIndex = -1;

    // Chrome-style inline type-ahead completion when typing forward
    if (
      allowInlineComplete &&
      !lastKeyWasDelete &&
      input.selectionStart === raw.length &&
      input.selectionEnd === raw.length
    ) {
      const completed = getInlineCompletion(raw, local);
      if (completed) {
        isApplyingPreview = true;
        input.value = completed;
        input.setSelectionRange(raw.length, completed.length);
        isApplyingPreview = false;
        onSyncClear?.();
      }
    }

    render();

    // Fetch live search engine suggestions (debounced) for non-URL queries
    if (trimmed.length >= 2 && !isLikelyUrlInput(trimmed) && canShow()) {
      const seq = ++remoteReqSeq;
      const engineId = context?.getEngineId?.() || "google";
      remoteTimer = window.setTimeout(async () => {
        const remote = await tauriIpc.getSearchSuggestions(trimmed, engineId);
        if (seq !== remoteReqSeq) return;
        mergeRemoteSuggestions(trimmed, remote);
      }, 160);
    }
  }

  input.addEventListener("focus", () => {
    updateSuggestions(false);
  });

  input.addEventListener("input", () => {
    if (isApplyingPreview) return;
    updateSuggestions(true);
  });

  input.addEventListener("keydown", (e) => {
    lastKeyWasDelete = e.key === "Backspace" || e.key === "Delete";

    const isOpen = !dropdown.classList.contains("hidden") && items.length > 0;
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = activeIndex >= items.length - 1 ? -1 : activeIndex + 1;
      const nextVal = activeIndex >= 0 ? items[activeIndex].value : typedQuery;
      isApplyingPreview = true;
      input.value = nextVal;
      input.setSelectionRange(nextVal.length, nextVal.length);
      isApplyingPreview = false;
      onSyncClear?.();
      updateRowHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = activeIndex <= -1 ? items.length - 1 : activeIndex - 1;
      const nextVal = activeIndex >= 0 ? items[activeIndex].value : typedQuery;
      isApplyingPreview = true;
      input.value = nextVal;
      input.setSelectionRange(nextVal.length, nextVal.length);
      isApplyingPreview = false;
      onSyncClear?.();
      updateRowHighlight();
    } else if (e.key === "Tab") {
      const targetItem = items[activeIndex >= 0 ? activeIndex : 0];
      if (targetItem) {
        e.preventDefault();
        isApplyingPreview = true;
        input.value = targetItem.value;
        typedQuery = targetItem.value;
        isApplyingPreview = false;
        onSyncClear?.();
        updateSuggestions(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      isApplyingPreview = true;
      input.value = typedQuery;
      isApplyingPreview = false;
      onSyncClear?.();
      close();
    } else if (e.key === "Enter" && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      e.stopImmediatePropagation();
      commitSelection(items[activeIndex]);
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.activeElement !== input) {
        close();
      }
    }, 120);
  });

  return {
    close,
    refresh: () => updateSuggestions(false),
  };
}
