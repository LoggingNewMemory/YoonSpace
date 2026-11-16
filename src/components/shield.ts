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
// YoonSpace Shields adblocking engine is powered by Brave Software's
// open-source `adblock-rust` engine (Mozilla Public License 2.0).
// Reference repository: <https://github.com/brave/adblock-rust>
// Copyright (c) Brave Software Inc. All rights reserved.
// Filter syntax: EasyList, EasyPrivacy, and Brave Unbreak specifications.

import { tauriIpc } from "../services/tauri_ipc";
import type { TabBreakdown } from "../types";

export interface ShieldController {
  updateCount: (count: number) => void;
  updateBreakdown: (breakdown: TabBreakdown) => void;
  setDomain: (domain: string) => void;
  setTabId: (tabId: string | null) => void;
  togglePopover: () => void;
  closePopover: () => void;
}

export function initShieldUI(
  shieldBtn: HTMLButtonElement,
  countBadge: HTMLElement,
  shieldIcon: HTMLElement,
  sidebar: HTMLElement,
  onToggle?: (isOpen: boolean) => void,
  onReload?: () => void
): ShieldController {
  let isShieldEnabled = true;
  let activeTabId: string | null = null;
  let currentBreakdown: TabBreakdown = { total: 0, trackers: 0, ads: 0, miners: 0 };

  const toggleInput = sidebar.querySelector("#shield-toggle-input") as HTMLInputElement | null;
  const optTrackers = sidebar.querySelector("#shield-opt-trackers") as HTMLInputElement | null;
  const optHttps = sidebar.querySelector("#shield-opt-https") as HTMLInputElement | null;
  const optSandbox = sidebar.querySelector("#shield-opt-sandbox") as HTMLInputElement | null;

  const statusBadge = sidebar.querySelector("#shield-status-badge") as HTMLElement | null;
  const optionsContainer = sidebar.querySelector("#shield-options-container") as HTMLElement | null;
  const closeBtn = sidebar.querySelector("#btn-close-shields") as HTMLButtonElement | null;

  const siteDomainEl = sidebar.querySelector("#shield-site-domain") as HTMLElement | null;
  const statCountEl = sidebar.querySelector("#shield-stat-count") as HTMLElement | null;
  const statTrackersEl = sidebar.querySelector("#shield-stat-trackers") as HTMLElement | null;
  const statAdsEl = sidebar.querySelector("#shield-stat-ads") as HTMLElement | null;
  const statMinersEl = sidebar.querySelector("#shield-stat-miners") as HTMLElement | null;

  // Initialize initial state from backend
  tauriIpc.getShieldStats().then((stats) => {
    isShieldEnabled = stats.enabled;
    if (toggleInput) toggleInput.checked = stats.enabled;
    if (optTrackers) optTrackers.checked = stats.block_trackers;
    if (optHttps) optHttps.checked = stats.upgrade_https;
    if (optSandbox) optSandbox.checked = stats.aggressive_sandbox;
    updateVisualState();
  });

  function updateVisualState() {
    if (toggleInput) {
      toggleInput.checked = isShieldEnabled;
    }

    if (statusBadge) {
      if (isShieldEnabled) {
        statusBadge.textContent = "SHIELDS UP";
        statusBadge.className =
          "px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#e95420]/20 text-[#e95420] border border-[#e95420]/30";
      } else {
        statusBadge.textContent = "SHIELDS DOWN";
        statusBadge.className =
          "px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-800 text-neutral-400 border border-neutral-700";
      }
    }

    if (optionsContainer) {
      if (isShieldEnabled) {
        optionsContainer.classList.remove("opacity-40", "pointer-events-none");
      } else {
        optionsContainer.classList.add("opacity-40", "pointer-events-none");
      }
    }

    if (optTrackers) optTrackers.disabled = !isShieldEnabled;
    if (optHttps) optHttps.disabled = !isShieldEnabled;
    if (optSandbox) optSandbox.disabled = !isShieldEnabled;

    const total = isShieldEnabled ? currentBreakdown.total : 0;

    if (isShieldEnabled) {
      shieldIcon.textContent = "shield";
      if (total > 0) {
        shieldBtn.className =
          "h-7 min-w-[28px] px-1.5 rounded-lg flex items-center justify-center gap-1 text-[#f85e2a] hover:text-[#ff7e4f] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
        countBadge.classList.remove("hidden");
        countBadge.textContent = total.toString();
      } else {
        shieldBtn.className =
          "w-7 h-7 rounded-lg flex items-center justify-center text-[#f85e2a] hover:text-[#ff7e4f] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
        countBadge.classList.add("hidden");
      }
      shieldBtn.title = total > 0 ? `YoonSpace Shields - Shields UP (${total} blocked)` : "YoonSpace Shields - Shields UP";
    } else {
      shieldBtn.className =
        "w-7 h-7 rounded-lg flex items-center justify-center text-[#716f6d] hover:text-[#9c9a98] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none no-drag shrink-0";
      shieldIcon.textContent = "shield";
      countBadge.classList.add("hidden");
      shieldBtn.title = "YoonSpace Shields - Shields DOWN";
    }

    if (statCountEl) {
      statCountEl.textContent = total.toString();
    }

    if (statTrackersEl) {
      statTrackersEl.textContent = (isShieldEnabled ? currentBreakdown.trackers : 0).toString();
    }
    if (statAdsEl) {
      statAdsEl.textContent = (isShieldEnabled ? currentBreakdown.ads : 0).toString();
    }
    if (statMinersEl) {
      statMinersEl.textContent = (isShieldEnabled ? currentBreakdown.miners : 0).toString();
    }
  }

  // Master Shield Toggle
  toggleInput?.addEventListener("change", async () => {
    const nextState = toggleInput.checked;
    isShieldEnabled = await tauriIpc.toggleShield(nextState);
    updateVisualState();
    onReload?.();
  });

  // Sub-features Toggles
  optTrackers?.addEventListener("change", async () => {
    if (optTrackers) {
      const res = await tauriIpc.toggleShieldTrackers(optTrackers.checked);
      optTrackers.checked = res;
      onReload?.();
    }
  });

  optHttps?.addEventListener("change", async () => {
    if (optHttps) {
      const res = await tauriIpc.toggleShieldHttps(optHttps.checked);
      optHttps.checked = res;
      onReload?.();
    }
  });

  optSandbox?.addEventListener("change", async () => {
    if (optSandbox) {
      const res = await tauriIpc.toggleShieldSandbox(optSandbox.checked);
      optSandbox.checked = res;
      onReload?.();
    }
  });

  async function openPopover() {
    sidebar.classList.remove("hidden");
    onToggle?.(true);
    try {
      const stats = await tauriIpc.getShieldStats();
      isShieldEnabled = stats.enabled;
      if (toggleInput) toggleInput.checked = stats.enabled;
      if (optTrackers) optTrackers.checked = stats.block_trackers;
      if (optHttps) optHttps.checked = stats.upgrade_https;
      if (optSandbox) optSandbox.checked = stats.aggressive_sandbox;

      if (activeTabId) {
        const tabBreakdown = await tauriIpc.getTabShieldBreakdown(activeTabId);
        currentBreakdown = { ...tabBreakdown };
      }
      updateVisualState();
    } catch {}
  }

  function closePopover() {
    sidebar.classList.add("hidden");
    onToggle?.(false);
  }

  function togglePopover() {
    if (sidebar.classList.contains("hidden")) {
      openPopover();
    } else {
      closePopover();
    }
  }

  shieldBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePopover();
  });

  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    closePopover();
  });

  document.addEventListener("click", (e) => {
    if (!sidebar.classList.contains("hidden")) {
      const target = e.target as HTMLElement;
      if (!sidebar.contains(target) && !shieldBtn.contains(target)) {
        closePopover();
      }
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sidebar.classList.contains("hidden")) {
      closePopover();
    }
  });

  return {
    updateCount: (count: number) => {
      currentBreakdown.total = count;
      updateVisualState();
    },
    updateBreakdown: (breakdown: TabBreakdown) => {
      currentBreakdown = { ...breakdown };
      updateVisualState();
    },
    setDomain: (domain: string) => {
      if (siteDomainEl) {
        siteDomainEl.textContent = domain || "Current Website";
      }
    },
    setTabId: (tabId: string | null) => {
      activeTabId = tabId;
    },
    togglePopover,
    closePopover,
  };
}
