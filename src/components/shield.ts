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
//
// ACKNOWLEDGEMENT & ATTRIBUTION:
// Powered by Brave Software's open-source `adblock-rust` engine (MPL-2.0).
// Filter syntax: EasyList & EasyPrivacy. <https://github.com/brave/adblock-rust>

import { tauriIpc } from "../services/tauri_ipc";

export interface ShieldController {
  updateCount: (count: number) => void;
  setDomain: (domain: string) => void;
  togglePopover: () => void;
  closePopover: () => void;
}

export function initShieldUI(
  shieldBtn: HTMLButtonElement,
  countBadge: HTMLElement,
  shieldIcon: HTMLElement,
  tray: HTMLElement,
  onToggle?: (isOpen: boolean) => void
): ShieldController {
  let isShieldEnabled = true;
  let currentTabCount = 0;

  const toggleInput = tray.querySelector("#shield-toggle-input") as HTMLInputElement;
  const statusLabel = tray.querySelector("#shield-status-label") as HTMLElement;
  const siteDomainEl = tray.querySelector("#shield-site-domain") as HTMLElement;
  const statCountEl = tray.querySelector("#shield-stat-count") as HTMLElement;
  const closeBtn = tray.querySelector("#shield-popover-close") as HTMLButtonElement;
  const headerIconBox = tray.querySelector("#shield-header-icon-box") as HTMLElement;

  // Initialize initial state from backend
  tauriIpc.getShieldStats().then((stats) => {
    isShieldEnabled = stats.enabled;
    if (toggleInput) {
      toggleInput.checked = isShieldEnabled;
    }
    updateVisualState();
  });

  function updateVisualState() {
    if (isShieldEnabled) {
      if (statusLabel) {
        statusLabel.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span><span>Shields UP</span>`;
        statusLabel.className =
          "ml-2 text-[10px] text-[#22c55e] font-medium flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20";
      }
      if (headerIconBox) {
        headerIconBox.className =
          "w-7 h-7 rounded-lg bg-[#f85e2a]/15 flex items-center justify-center text-[#f85e2a]";
      }
      shieldIcon.textContent = "shield";
      if (currentTabCount > 0) {
        shieldBtn.className =
          "h-7 min-w-[28px] px-1.5 rounded-lg flex items-center justify-center gap-1 text-[#f85e2a] hover:text-[#ff7e4f] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
        countBadge.classList.remove("hidden");
        countBadge.textContent = currentTabCount.toString();
      } else {
        shieldBtn.className =
          "w-7 h-7 rounded-lg flex items-center justify-center text-[#f85e2a] hover:text-[#ff7e4f] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
        countBadge.classList.add("hidden");
      }
    } else {
      if (statusLabel) {
        statusLabel.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#858280]"></span><span>Shields DOWN</span>`;
        statusLabel.className =
          "ml-2 text-[10px] text-[#858280] font-medium flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#858280]/10 border border-[#858280]/20";
      }
      if (headerIconBox) {
        headerIconBox.className =
          "w-7 h-7 rounded-lg bg-[#333] flex items-center justify-center text-[#858280]";
      }
      shieldBtn.className =
        "w-7 h-7 rounded-lg flex items-center justify-center text-[#716f6d] hover:text-[#9c9a98] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
      shieldIcon.textContent = "shield_with_heart";
      countBadge.classList.add("hidden");
    }
    if (statCountEl) {
      statCountEl.textContent = currentTabCount.toString();
    }
  }

  toggleInput?.addEventListener("change", async () => {
    const nextState = toggleInput.checked;
    isShieldEnabled = await tauriIpc.toggleShield(nextState);
    updateVisualState();
  });

  closeBtn?.addEventListener("click", () => {
    closePopover();
  });

  function openPopover() {
    tray.classList.remove("hidden");
    onToggle?.(true);
  }

  function closePopover() {
    tray.classList.add("hidden");
    onToggle?.(false);
  }

  function togglePopover() {
    if (tray.classList.contains("hidden")) {
      openPopover();
    } else {
      closePopover();
    }
  }

  shieldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopover();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !tray.classList.contains("hidden")) {
      closePopover();
    }
  });

  return {
    updateCount: (count: number) => {
      currentTabCount = count;
      updateVisualState();
    },
    setDomain: (domain: string) => {
      if (siteDomainEl) {
        siteDomainEl.textContent = domain || "Current Website";
      }
    },
    togglePopover,
    closePopover,
  };
}
