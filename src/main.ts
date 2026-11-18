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

import "./styles/main.css";
import { tauriIpc } from "./services/tauri_ipc";
import { createTitlebar } from "./components/titlebar";
import { createDock, type DockController } from "./components/dock";
import { createWebBar, type WebBarController } from "./components/web_bar";
import { createWelcomeScreen } from "./components/welcome";
import { createSplitPresetsSection } from "./components/split_presets";
import type { AppConfig, MinimizedTab, SplitBounds, SplitPreset, SplitRatioChangedEvent } from "./types";

let currentConfig: AppConfig;
let isViewOpen = false;
let activeTab: MinimizedTab | null = null;
let dock: DockController;
let webBar: WebBarController;
let isShieldOpen = false;
let isSpawning = false;
let dragSplitOverlay: HTMLElement | null = null;
let isDropHandled = false;

function getSplitBounds(): SplitBounds {
  const dockWidth = dock ? dock.getWidth() : 64;
  const rightOffset = isShieldOpen ? 360 : 0;
  const headerHeight = 80;
  const webBarHeight = 28;
  const topOffset = headerHeight + webBarHeight;
  return {
    x: dockWidth,
    y: topOffset,
    width: Math.max(300, window.innerWidth - dockWidth - rightOffset),
    height: Math.max(300, window.innerHeight - topOffset),
    split_ratio: activeTab?.isSplit ? (activeTab.splitRatio ?? 0.5) : undefined,
  };
}

function updateShieldForTab(tab: MinimizedTab | null) {
  const header = document.querySelector("header") as any;
  if (!header || !header.shieldController) return;
  if (!tab) {
    header.shieldController.setTabId(null);
    header.shieldController.setDomain("YoonSpace");
    header.shieldController.updateBreakdown({ total: 0, trackers: 0, ads: 0, miners: 0 });
    return;
  }
  header.shieldController.setTabId(tab.id);
  if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
    try {
      const leftDomain = new URL(tab.leftUrl).hostname.replace(/^www\./, "");
      const rightDomain = new URL(tab.rightUrl).hostname.replace(/^www\./, "");
      header.shieldController.setDomain(`${leftDomain} | ${rightDomain}`);
    } catch {
      header.shieldController.setDomain("Split View");
    }
  } else {
    const targetUrl = tab.url || tab.leftUrl || "";
    try {
      const domain = new URL(targetUrl).hostname.replace(/^www\./, "");
      header.shieldController.setDomain(domain);
    } catch {
      header.shieldController.setDomain("Current Website");
    }
  }
  tauriIpc.getTabShieldBreakdown(tab.id).then((breakdown) => {
    header.shieldController.updateBreakdown(breakdown);
  });
}

function normalizeUrl(input: string, activeEngineId: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://google.com";

  // If already starts with a protocol scheme (http://, https://, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Detect domain names (with or without subdomains, e.g. youtube.com, www.youtube.com), localhost, or IPv4
  const isDomainOrHost =
    !/\s/.test(trimmed) &&
    (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed));

  if (isDomainOrHost) {
    return `https://${trimmed}`;
  }

  const engine =
    currentConfig.search_engines.find((e) => e.id === activeEngineId) ||
    currentConfig.search_engines[0];
  return `${engine.query_url}${encodeURIComponent(trimmed)}`;
}

function deriveTitleFromInput(input: string): string {
  const trimmed = input.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      return u.hostname.replace(/^www\./, "");
    }
  } catch {
    // fallback
  }
  return trimmed;
}

async function handleSpawnPreset(preset: SplitPreset) {
  if (isSpawning) {
    console.warn("[YoonSpace] Spawn ignored: already initializing a view");
    return;
  }
  isSpawning = true;
  const tabId = "preset-" + preset.id;

  let leftTitle = "Left View";
  let rightTitle = "Right View";
  if (preset.title.includes("|")) {
    const parts = preset.title.split("|").map((p) => p.trim());
    leftTitle = parts[0] || leftTitle;
    rightTitle = parts[1] || rightTitle;
  }

  activeTab = {
    id: tabId,
    title: preset.title,
    url: preset.left_url,
    query: preset.title,
    isSplit: true,
    leftUrl: preset.left_url,
    rightUrl: preset.right_url,
    leftTitle,
    rightTitle,
    splitRatio: 0.5,
  };

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSplit(preset.left_url, preset.right_url, bounds, activeTab.id);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSplitMode(leftTitle, rightTitle, 0.5);
    webBar.show();
    updateShieldForTab(activeTab);
  } catch (e) {
    console.error("Failed to spawn preset:", e);
  } finally {
    isSpawning = false;
  }
}

async function handleSearch(query: string, engineId: string) {
  const targetUrl = normalizeUrl(query, engineId);
  const displayTitle = deriveTitleFromInput(query);

  // If a single tab is currently active and open, navigate it in-place instead of creating a new tab!
  if (isViewOpen && activeTab && !activeTab.isSplit) {
    activeTab.url = targetUrl;
    activeTab.query = query;
    activeTab.title = displayTitle;

    dock.updateTabTitle(activeTab.id, displayTitle);
    webBar.setSingleMode(displayTitle);

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = query;
    }

    try {
      await tauriIpc.navigateTab(activeTab.id, targetUrl);
      updateShieldForTab(activeTab);
    } catch (e) {
      console.error("Failed to navigate current tab:", e);
    }
    return;
  }

  if (isSpawning) {
    console.warn("[YoonSpace] Spawn single view ignored: already initializing a view");
    return;
  }
  isSpawning = true;

  const tabId = "tab-" + Date.now();

  activeTab = {
    id: tabId,
    title: displayTitle,
    url: targetUrl,
    query: query,
    isSplit: false,
  };

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSingleView(targetUrl, bounds, activeTab.id);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSingleMode(displayTitle);
    webBar.show();

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = query;
    }

    updateShieldForTab(activeTab);
  } catch (e) {
    console.error("Failed to spawn single view:", e);
  } finally {
    isSpawning = false;
  }
}

async function refreshTelemetry() {
  const ramBadge = document.getElementById("telemetry-ram");
  const badgeContainer = document.getElementById("telemetry-badge");
  try {
    const stats = await tauriIpc.getTelemetry();
    if (ramBadge) {
      ramBadge.textContent = `${stats.resident_mb.toFixed(0)} MB RAM`;
    }
    if (badgeContainer) {
      const gpuInfo = stats.gpu_renderer ? `\nGPU: ${stats.gpu_renderer}` : "";
      badgeContainer.title = `Private RAM: ${stats.resident_mb} MB\nTotal RSS: ${stats.total_rss_mb} MB (incl. shared OS libs)\nShared Libs: ${stats.shared_mb} MB${gpuInfo}`;
    }
  } catch {
    // ignore
  }
}

// User clicked Minimize on top web bar -> hides web view and shows workspace without reloading
async function handleMinimizeWeb() {
  await handleHomeClick();
}

// Close a specific tab (from sidebar or top web bar)
async function handleCloseTab(tabId: string) {
  const isClosingActive = activeTab && activeTab.id === tabId;
  dock.removeTab(tabId);

  try {
    await tauriIpc.closeTab(tabId);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to close webview on tab close:", e);
  }

  if (isClosingActive) {

    isViewOpen = false;
    activeTab = null;
    webBar.hide();

    // Check if other tabs remain in the sidebar
    const remainingTabs = dock.getTabs();
    if (remainingTabs.length > 0) {
      const nextTab = remainingTabs[remainingTabs.length - 1];
      await handleRestoreTab(nextTab);
      return;
    }

    // No tabs remain: return to Welcome screen
    updateShieldForTab(null);
    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = "";
    }

    dock.setActiveTabId(null);
  }
}

// User clicked Close on top web bar -> closes active tab
async function handleCloseWeb() {
  if (activeTab) {
    await handleCloseTab(activeTab.id);
  } else {
    await handleMinimizeWeb();
  }
}

// User clicked Minimize on Left pane of dual split view
async function handleMinimizeLeft() {
  if (!activeTab || !activeTab.isSplit || !activeTab.leftUrl || !activeTab.rightUrl) {
    await handleMinimizeWeb();
    return;
  }

  if (isSpawning) return;
  isSpawning = true;

  const tabId = activeTab.id;
  const leftTab: MinimizedTab = {
    id: "tab-" + Date.now(),
    title: activeTab.leftTitle || "Web Tab",
    url: activeTab.leftUrl,
    isSplit: false,
  };
  dock.addTab(leftTab);

  const remainingUrl = activeTab.rightUrl;
  const remainingTitle = activeTab.rightTitle || "Web View";

  activeTab.isSplit = false;
  activeTab.url = remainingUrl;
  activeTab.title = remainingTitle;
  delete activeTab.leftUrl;
  delete activeTab.rightUrl;
  delete activeTab.leftTitle;
  delete activeTab.rightTitle;
  delete activeTab.splitRatio;

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    const minimized = await tauriIpc.minimizeSplitPane(tabId, "left", leftTab.id, bounds);
    if (!minimized) {
      await tauriIpc.closeTab(tabId);
      await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    }
    webBar.setSingleMode(remainingTitle);

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = remainingUrl;
    }

    updateShieldForTab(activeTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to minimize left tab:", e);
  } finally {
    isSpawning = false;
  }
}

// User clicked Close on Left pane of dual split view -> closes left pane, Right goes full
async function handleCloseLeft() {
  if (!activeTab || !activeTab.isSplit || !activeTab.rightUrl) {
    await handleCloseWeb();
    return;
  }

  if (isSpawning) return;
  isSpawning = true;

  const tabId = activeTab.id;
  const remainingUrl = activeTab.rightUrl;
  const remainingTitle = activeTab.rightTitle || "Web View";

  activeTab.isSplit = false;
  activeTab.url = remainingUrl;
  activeTab.title = remainingTitle;
  delete activeTab.leftUrl;
  delete activeTab.rightUrl;
  delete activeTab.leftTitle;
  delete activeTab.rightTitle;
  delete activeTab.splitRatio;

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    const tempCloseId = "close-" + Date.now();
    const minimized = await tauriIpc.minimizeSplitPane(tabId, "left", tempCloseId, bounds);
    if (minimized) {
      await tauriIpc.closeTab(tempCloseId);
    } else {
      await tauriIpc.closeTab(tabId);
      await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    }
    webBar.setSingleMode(remainingTitle);

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = remainingUrl;
    }

    updateShieldForTab(activeTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to convert split to single on close left:", e);
  } finally {
    isSpawning = false;
  }
}

// User clicked Minimize on Right pane of dual split view
async function handleMinimizeRight() {
  if (!activeTab || !activeTab.isSplit || !activeTab.leftUrl || !activeTab.rightUrl) {
    await handleMinimizeWeb();
    return;
  }

  if (isSpawning) return;
  isSpawning = true;

  const tabId = activeTab.id;
  const rightTab: MinimizedTab = {
    id: "tab-" + Date.now(),
    title: activeTab.rightTitle || "Web Tab",
    url: activeTab.rightUrl,
    isSplit: false,
  };
  dock.addTab(rightTab);

  const remainingUrl = activeTab.leftUrl;
  const remainingTitle = activeTab.leftTitle || "Web View";

  activeTab.isSplit = false;
  activeTab.url = remainingUrl;
  activeTab.title = remainingTitle;
  delete activeTab.leftUrl;
  delete activeTab.rightUrl;
  delete activeTab.leftTitle;
  delete activeTab.rightTitle;
  delete activeTab.splitRatio;

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    const minimized = await tauriIpc.minimizeSplitPane(tabId, "right", rightTab.id, bounds);
    if (!minimized) {
      await tauriIpc.closeTab(tabId);
      await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    }
    webBar.setSingleMode(remainingTitle);

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = remainingUrl;
    }

    updateShieldForTab(activeTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to minimize right tab:", e);
  } finally {
    isSpawning = false;
  }
}

// User clicked Close on Right pane of dual split view -> closes right pane, Left goes full
async function handleCloseRight() {
  if (!activeTab || !activeTab.isSplit || !activeTab.leftUrl) {
    await handleCloseWeb();
    return;
  }

  if (isSpawning) return;
  isSpawning = true;

  const tabId = activeTab.id;
  const remainingUrl = activeTab.leftUrl;
  const remainingTitle = activeTab.leftTitle || "Web View";

  activeTab.isSplit = false;
  activeTab.url = remainingUrl;
  activeTab.title = remainingTitle;
  delete activeTab.leftUrl;
  delete activeTab.rightUrl;
  delete activeTab.leftTitle;
  delete activeTab.rightTitle;
  delete activeTab.splitRatio;

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    const tempCloseId = "close-" + Date.now();
    const minimized = await tauriIpc.minimizeSplitPane(tabId, "right", tempCloseId, bounds);
    if (minimized) {
      await tauriIpc.closeTab(tempCloseId);
    } else {
      await tauriIpc.closeTab(tabId);
      await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    }
    webBar.setSingleMode(remainingTitle);

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = remainingUrl;
    }

    updateShieldForTab(activeTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to convert split to single on close right:", e);
  } finally {
    isSpawning = false;
  }
}

// User clicked on a tab on the sidebar dock -> restores / activates it
async function handleRestoreTab(tab: MinimizedTab) {
  activeTab = tab;
  dock.setActiveTabId(tab.id);

  const bounds = getSplitBounds();

  try {
    const shown = await tauriIpc.showTabView(tab.id, bounds);
    if (!shown) {
      if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
        await tauriIpc.spawnSplit(tab.leftUrl, tab.rightUrl, bounds, tab.id);
      } else {
        await tauriIpc.spawnSingleView(tab.url || "", bounds, tab.id);
      }
    }

    if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
      let leftTitle = tab.leftTitle || "Left Pane";
      let rightTitle = tab.rightTitle || "Right Pane";
      if (!tab.leftTitle && tab.title.includes("|")) {
        const parts = tab.title.split("|").map((p) => p.trim());
        leftTitle = parts[0] || leftTitle;
        rightTitle = parts[1] || rightTitle;
      }
      webBar.setSplitMode(leftTitle, rightTitle, tab.splitRatio ?? 0.5);
      webBar.show();
    } else {
      webBar.setSingleMode(tab.title);
      webBar.show();
    }

    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = tab.url || tab.query || tab.title || "";
    }

    updateShieldForTab(tab);
  } catch (e) {
    console.error("Failed to restore tab:", e);
  }
}

function getTabEffectiveUrl(tab: MinimizedTab, preferPane: "left" | "right" = "left"): string {
  if (tab.isSplit) {
    if (preferPane === "right") {
      return tab.rightUrl || tab.leftUrl || tab.url || "https://google.com";
    }
    return tab.leftUrl || tab.rightUrl || tab.url || "https://google.com";
  }
  return tab.url || tab.leftUrl || tab.rightUrl || "https://google.com";
}

function getTabEffectiveTitle(tab: MinimizedTab, preferPane: "left" | "right" = "left"): string {
  if (tab.isSplit) {
    if (preferPane === "right") {
      return tab.rightTitle || tab.leftTitle || tab.title || "Web View";
    }
    return tab.leftTitle || tab.rightTitle || tab.title || "Web View";
  }
  return tab.title || tab.leftTitle || tab.rightTitle || "Web View";
}

function updateDragOverlayBounds() {
  if (!dragSplitOverlay) return;
  const bounds = getSplitBounds();
  dragSplitOverlay.style.left = `${bounds.x}px`;
  dragSplitOverlay.style.top = `${bounds.y}px`;
  dragSplitOverlay.style.width = `${bounds.width}px`;
  dragSplitOverlay.style.height = `${bounds.height}px`;
}

let overlayLeftZone: HTMLElement | null = null;
let overlayRightZone: HTMLElement | null = null;
let activeSnapZone: "left" | "right" | "none" = "none";

function setSnapZoneHover(zone: HTMLElement, hovered: boolean) {
  if (hovered) {
    zone.className =
      "flex-1 h-full rounded-2xl border-2 border-solid border-[#f85e2a] bg-[#f85e2a]/15 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#ffb59e] opacity-100 shadow-[0_0_30px_rgba(248,94,42,0.3)]";
  } else {
    zone.className =
      "flex-1 h-full rounded-2xl border-2 border-dashed border-[#f85e2a]/30 bg-[#141416]/85 flex flex-col items-center justify-center gap-3 transition-colors duration-100 text-[#aa8a80] opacity-40";
  }
}

async function handleTabDragStart(tab: MinimizedTab) {
  isDropHandled = false;
  activeSnapZone = "none";

  if (isViewOpen && activeTab && activeTab.id !== tab.id) {
    updateDragOverlayBounds();
    if (dragSplitOverlay) {
      if (overlayLeftZone) setSnapZoneHover(overlayLeftZone, false);
      if (overlayRightZone) setSnapZoneHover(overlayRightZone, false);

      const leftSubtitle = dragSplitOverlay.querySelector("#drag-drop-left-subtitle");
      if (leftSubtitle) leftSubtitle.textContent = `Tile "${tab.title}" on the left`;

      const rightSubtitle = dragSplitOverlay.querySelector("#drag-drop-right-subtitle");
      if (rightSubtitle) rightSubtitle.textContent = `Tile "${tab.title}" on the right`;

      dragSplitOverlay.classList.remove("hidden");
      dragSplitOverlay.classList.add("flex");
    }
    await tauriIpc.setDragMode(true);
  }
}

function handleTabDragMove(_tab: MinimizedTab, x: number, y: number) {
  if (dragSplitOverlay && !dragSplitOverlay.classList.contains("hidden")) {
    const bounds = getSplitBounds();
    let newZone: "left" | "right" | "none" = "none";

    if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
      newZone = x < bounds.x + bounds.width / 2 ? "left" : "right";
    }

    if (newZone !== activeSnapZone) {
      activeSnapZone = newZone;
      if (overlayLeftZone && overlayRightZone) {
        setSnapZoneHover(overlayLeftZone, newZone === "left");
        setSnapZoneHover(overlayRightZone, newZone === "right");
      }
    }
  }
}

async function handleTabDragEnd(tab: MinimizedTab, x: number, y: number, targetTabId?: string) {
  activeSnapZone = "none";

  if (dragSplitOverlay && !dragSplitOverlay.classList.contains("hidden")) {
    dragSplitOverlay.classList.add("hidden");
    dragSplitOverlay.classList.remove("flex");
    if (overlayLeftZone) setSnapZoneHover(overlayLeftZone, false);
    if (overlayRightZone) setSnapZoneHover(overlayRightZone, false);
  }

  // 1. Dropped directly onto another dock tab
  if (targetTabId && targetTabId !== tab.id) {
    isDropHandled = true;
    await tauriIpc.setDragMode(false);
    await handleTabDropOnTab(tab.id, targetTabId);
    return;
  }

  // 2. Dropped into the split tiling area
  const bounds = getSplitBounds();
  if (
    isViewOpen &&
    activeTab &&
    activeTab.id !== tab.id &&
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  ) {
    isDropHandled = true;
    const isLeft = x < bounds.x + bounds.width / 2;
    await handleSplitWithActive(tab, isLeft ? "left" : "right");
    return;
  }

  // 3. Dropped onto canvas while on Welcome screen -> open / restore the tab without reload
  if (!isViewOpen && x >= bounds.x) {
    isDropHandled = true;
    await tauriIpc.setDragMode(false);
    await handleRestoreTab(tab);
    return;
  }

  // 4. Dropped outside or cancelled drag -> restore the active view instantaneously without reloading!
  await tauriIpc.setDragMode(false);
  if (!isDropHandled && isViewOpen && activeTab) {
    await tauriIpc.showTabView(activeTab.id, bounds);
  }
}

async function handleTabDragCancel() {
  activeSnapZone = "none";

  if (dragSplitOverlay && !dragSplitOverlay.classList.contains("hidden")) {
    dragSplitOverlay.classList.add("hidden");
    dragSplitOverlay.classList.remove("flex");
    if (overlayLeftZone) setSnapZoneHover(overlayLeftZone, false);
    if (overlayRightZone) setSnapZoneHover(overlayRightZone, false);
  }

  await tauriIpc.setDragMode(false);
  if (!isDropHandled && isViewOpen && activeTab) {
    const bounds = getSplitBounds();
    await tauriIpc.showTabView(activeTab.id, bounds);
  }
}

async function handleSplitWithActive(draggedTab: MinimizedTab, pane: "left" | "right") {
  isDropHandled = true;
  if (!activeTab || activeTab.id === draggedTab.id) {
    await tauriIpc.setDragMode(false);
    return;
  }

  if (isSpawning) {
    await tauriIpc.setDragMode(false);
    return;
  }
  isSpawning = true;

  if (dragSplitOverlay) {
    dragSplitOverlay.classList.add("hidden");
    dragSplitOverlay.classList.remove("flex");
  }

  const leftTab = pane === "left" ? draggedTab : activeTab;
  const rightTab = pane === "left" ? activeTab : draggedTab;

  const leftUrl = getTabEffectiveUrl(leftTab, "left");
  const leftTitle = getTabEffectiveTitle(leftTab, "left");
  const rightUrl = getTabEffectiveUrl(rightTab, "right");
  const rightTitle = getTabEffectiveTitle(rightTab, "right");

  // Remove dragged tab from dock
  dock.removeTab(draggedTab.id);

  // If activeTab was already a split view, preserve replaced pane back to dock
  if (activeTab.isSplit) {
    const replacedUrl = pane === "left" ? activeTab.leftUrl : activeTab.rightUrl;
    const replacedTitle = pane === "left" ? activeTab.leftTitle : activeTab.rightTitle;
    if (replacedUrl) {
      const savedTab: MinimizedTab = {
        id: "tab-" + Date.now(),
        title: replacedTitle || "Web View",
        url: replacedUrl,
        isSplit: false,
      };
      dock.addTab(savedTab);
    }
  }

  // Update activeTab to be a split tab
  activeTab.isSplit = true;
  activeTab.leftUrl = leftUrl;
  activeTab.leftTitle = leftTitle;
  activeTab.rightUrl = rightUrl;
  activeTab.rightTitle = rightTitle;
  activeTab.title = `${leftTitle} | ${rightTitle}`;
  activeTab.splitRatio = 0.5;

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();
  try {
    const merged = await tauriIpc.mergeTabsToSplit(activeTab.id, draggedTab.id, pane, bounds);
    if (!merged) {
      try {
        await tauriIpc.closeTab(draggedTab.id);
      } catch {}
      try {
        await tauriIpc.closeTab(activeTab.id);
      } catch {}
      await tauriIpc.spawnSplit(leftUrl, rightUrl, bounds, activeTab.id);
    }
    await tauriIpc.setDragMode(false);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSplitMode(leftTitle, rightTitle, 0.5);
    webBar.show();
    updateShieldForTab(activeTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to spawn split view from drag:", e);
  } finally {
    isSpawning = false;
  }
}

async function handleTabDropOnTab(sourceTabId: string, targetTabId: string) {
  isDropHandled = true;
  if (sourceTabId === targetTabId) return;

  const sourceTab = dock.getTab(sourceTabId);
  const targetTab = dock.getTab(targetTabId);
  if (!sourceTab || !targetTab) return;

  if (isSpawning) return;
  isSpawning = true;

  const leftUrl = getTabEffectiveUrl(targetTab, "left");
  const leftTitle = getTabEffectiveTitle(targetTab, "left");
  const rightUrl = getTabEffectiveUrl(sourceTab, "right");
  const rightTitle = getTabEffectiveTitle(sourceTab, "right");

  dock.removeTab(sourceTabId);

  targetTab.isSplit = true;
  targetTab.leftUrl = leftUrl;
  targetTab.leftTitle = leftTitle;
  targetTab.rightUrl = rightUrl;
  targetTab.rightTitle = rightTitle;
  targetTab.title = `${leftTitle} | ${rightTitle}`;
  targetTab.splitRatio = 0.5;

  dock.addTab(targetTab);

  if (dragSplitOverlay) {
    dragSplitOverlay.classList.add("hidden");
    dragSplitOverlay.classList.remove("flex");
  }

  const bounds = getSplitBounds();
  try {
    const merged = await tauriIpc.mergeTabsToSplit(targetTab.id, sourceTab.id, "right", bounds);
    if (!merged) {
      try {
        await tauriIpc.closeTab(sourceTab.id);
      } catch {}
      try {
        await tauriIpc.closeTab(targetTab.id);
      } catch {}
      await tauriIpc.spawnSplit(leftUrl, rightUrl, bounds, targetTab.id);
    }
    await tauriIpc.setDragMode(false);

    activeTab = targetTab;
    dock.setActiveTabId(targetTab.id);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSplitMode(leftTitle, rightTitle, 0.5);
    webBar.show();
    updateShieldForTab(targetTab);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
  } catch (e) {
    console.error("Failed to merge dropped tabs:", e);
  } finally {
    isSpawning = false;
  }
}

function initDragSplitOverlay(): HTMLElement {
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

  overlayLeftZone = overlay.querySelector("#drag-drop-left") as HTMLElement;
  overlayRightZone = overlay.querySelector("#drag-drop-right") as HTMLElement;

  return overlay;
}

// User clicked Home / Workspaces in dock
async function handleHomeClick() {
  if (isViewOpen) {
    try {
      await tauriIpc.hideWebviews();
      setTimeout(refreshTelemetry, 100);
      setTimeout(refreshTelemetry, 300);
    } catch (e) {
      console.error("Failed to hide webviews on workspace click:", e);
    }

    isViewOpen = false;
    webBar.hide();

    updateShieldForTab(null);

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = "";
    }

    dock.setActiveTabId(null);
  } else {
    dock.setActiveTabId(null);
  }
}

// User clicked Add (+) in dock -> goes to home / focuses omnibar
async function handleNewTab() {
  await handleHomeClick();
  const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
  if (omnibarInput) {
    omnibarInput.focus();
    omnibarInput.select();
  }
}

async function startTelemetryLoop() {
  const ramBadge = document.getElementById("telemetry-ram");
  const badgeContainer = document.getElementById("telemetry-badge");

  const update = async () => {
    const stats = await tauriIpc.getTelemetry();
    if (ramBadge) {
      ramBadge.textContent = `${stats.resident_mb.toFixed(0)} MB RAM`;
    }
    if (badgeContainer) {
      const gpuInfo = stats.gpu_renderer ? `\nGPU: ${stats.gpu_renderer}` : "";
      badgeContainer.title = `Private RAM: ${stats.resident_mb} MB\nTotal RSS: ${stats.total_rss_mb} MB (incl. shared OS libs)\nShared Libs: ${stats.shared_mb} MB${gpuInfo}`;
    }
  };

  await update();
  setInterval(update, 2000);
}

window.addEventListener("resize", () => {
  if (isViewOpen) {
    const bounds = getSplitBounds();
    tauriIpc.updateSplitLayout(bounds);
  }
  updateDragOverlayBounds();
});

async function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  currentConfig = await tauriIpc.getAppConfig();

  const handleBack = () => {
    if (isViewOpen && activeTab) {
      tauriIpc.goBack(activeTab.id);
    }
  };

  const handleForward = () => {
    if (isViewOpen && activeTab) {
      tauriIpc.goForward(activeTab.id);
    }
  };

  const handleReload = () => {
    if (isViewOpen && activeTab) {
      tauriIpc.reload(activeTab.id);
    }
  };

  const handleShieldToggle = (isOpen: boolean) => {
    isShieldOpen = isOpen;
    const rightOffset = isShieldOpen ? 360 : 0;
    webBar.setRightOffset(rightOffset);
    mainWrapper.style.paddingRight = `${rightOffset}px`;
    if (isViewOpen) {
      const bounds = getSplitBounds();
      tauriIpc.updateSplitLayout(bounds);
    }
    updateDragOverlayBounds();
  };

  // 1. Titlebar (Fixed at top, height: 80px default)
  const titlebar = createTitlebar(
    (url) => handleSearch(url, currentConfig.active_search_engine),
    handleHomeClick,
    handleBack,
    handleForward,
    handleReload,
    handleShieldToggle
  );
  app.appendChild(titlebar);

  // 2. Web Header Bar (Fixed at top: 80px, left: 64px, right: 0, height: 28px)
  webBar = createWebBar({
    onMinimize: handleMinimizeWeb,
    onClose: handleCloseWeb,
    onMinimizeLeft: handleMinimizeLeft,
    onCloseLeft: handleCloseLeft,
    onMinimizeRight: handleMinimizeRight,
    onCloseRight: handleCloseRight,
  });
  app.appendChild(webBar.element);

  // 4. Main Canvas & Welcome Screen
  const mainWrapper = document.createElement("div");
  mainWrapper.className =
    "pl-16 min-h-screen pt-20 flex flex-col justify-center items-center bg-[#131313] overflow-y-auto transition-[padding] duration-200 ease-out";

  // 3. Dock with Arc / Zen Collapsible Sidebar
  dock = createDock(
    (tabId) => {
      if (tabId === "home" || tabId === "workspaces") {
        handleHomeClick();
      }
    },
    handleRestoreTab,
    handleCloseTab,
    handleNewTab,
    (isExpanded) => {
      const dockWidth = isExpanded ? 220 : 64;
      webBar.setLeftOffset(dockWidth);
      mainWrapper.style.paddingLeft = `${dockWidth}px`;
      if (isViewOpen) {
        const bounds = getSplitBounds();
        tauriIpc.updateSplitLayout(bounds);
      }
      updateDragOverlayBounds();
    },
    handleTabDragStart,
    handleTabDragEnd,
    handleTabDropOnTab,
    handleTabDragMove,
    handleTabDragCancel,
    (tab, pane) => {
      handleSplitWithActive(tab, pane);
    }
  );
  app.appendChild(dock.element);

  // Drag Split Overlay for dropping tab onto active view
  dragSplitOverlay = initDragSplitOverlay();
  app.appendChild(dragSplitOverlay);

  // Navigation keyboard shortcuts: Reload (Ctrl+R / F5), Back (Alt+Left), Forward (Alt+Right)
  window.addEventListener("keydown", (e) => {
    // 1. Reload (Ctrl+R / Cmd+R / F5)
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      if (isViewOpen && activeTab) {
        handleReload();
      } else {
        window.location.reload();
      }
    }
    // 2. Back (Alt+Left / Alt+ArrowLeft / Cmd+[)
    else if (((e.altKey && (e.key === "ArrowLeft" || e.key === "Left")) || (e.metaKey && e.key === "[")) && isViewOpen && activeTab) {
      e.preventDefault();
      handleBack();
    }
    // 3. Forward (Alt+Right / Alt+ArrowRight / Cmd+])
    else if (((e.altKey && (e.key === "ArrowRight" || e.key === "Right")) || (e.metaKey && e.key === "]")) && isViewOpen && activeTab) {
      e.preventDefault();
      handleForward();
    }
  });

  const main = document.createElement("main");
  main.id = "main-canvas";
  main.className =
    "relative w-full flex-1 flex flex-col items-center justify-center p-6 md:p-10";

  const welcome = createWelcomeScreen(
    currentConfig,
    handleSearch,
    async (engineId) => {
      currentConfig.active_search_engine = engineId;
      await tauriIpc.updateAppConfig(currentConfig);
    }
  );

  const presets = createSplitPresetsSection(
    currentConfig.split_presets,
    handleSpawnPreset
  );
  welcome.appendChild(presets);

  main.appendChild(welcome);
  mainWrapper.appendChild(main);
  app.appendChild(mainWrapper);

  // 5. Real-time document title updates from WebKit
  tauriIpc.listen<string>("webview-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && !activeTab.isSplit) {
      activeTab.title = event.payload;
      webBar.setSingleMode(event.payload);
      dock.updateTabTitle(activeTab.id, event.payload);
    }
  });

  tauriIpc.listen<string>("webview-split-left-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && activeTab.isSplit) {
      activeTab.leftTitle = event.payload;
      webBar.setLeftTitle(event.payload);
      const combined = `${event.payload} | ${activeTab.rightTitle || "Right"}`;
      activeTab.title = combined;
      dock.updateTabTitle(activeTab.id, combined, event.payload, activeTab.rightTitle);
    }
  });

  tauriIpc.listen<string>("webview-split-right-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && activeTab.isSplit) {
      activeTab.rightTitle = event.payload;
      webBar.setRightTitle(event.payload);
      const combined = `${activeTab.leftTitle || "Left"} | ${event.payload}`;
      activeTab.title = combined;
      dock.updateTabTitle(activeTab.id, combined, activeTab.leftTitle, event.payload);
    }
  });

  // 6. Real-time URL synchronization (In-page link clicks, redirects, history navigation)
  tauriIpc.listen<{ tab_id: string; url: string }>("webview-url-changed", (event) => {
    const { tab_id, url } = event.payload;
    const tab = dock.getTab(tab_id);
    if (tab) {
      tab.url = url;
    }
    if (activeTab && activeTab.id === tab_id) {
      activeTab.url = url;
      const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
      if (omnibarInput && document.activeElement !== omnibarInput) {
        omnibarInput.value = url;
      }
      updateShieldForTab(activeTab);
    }
  });

  tauriIpc.listen<{ tab_id: string; pane: "left" | "right"; url: string }>("webview-split-url-changed", (event) => {
    const { tab_id, pane, url } = event.payload;
    const tab = dock.getTab(tab_id);
    if (tab) {
      if (pane === "left") tab.leftUrl = url;
      if (pane === "right") tab.rightUrl = url;
    }
    if (activeTab && activeTab.id === tab_id) {
      if (pane === "left") activeTab.leftUrl = url;
      if (pane === "right") activeTab.rightUrl = url;
      updateShieldForTab(activeTab);
    }
  });

  // 7. Real-time Shields block events (Brave adblock-rust)
  tauriIpc.onShieldBlocked((event) => {
    if (activeTab && (activeTab.id === event.tab_id || event.tab_id.startsWith(activeTab.id))) {
      (titlebar as any).shieldController?.updateBreakdown(event.tab_breakdown);
    }
  });

  // 8. Real-time Split Ratio synchronization (when dragging native GTK Paned splitter)
  tauriIpc.listen<SplitRatioChangedEvent>("split-ratio-changed", (event) => {
    const { tab_id, ratio } = event.payload;
    const clampedRatio = Math.max(0.30, Math.min(0.70, ratio));
    const tab = dock.getTab(tab_id);
    if (tab) {
      tab.splitRatio = clampedRatio;
    }
    if (activeTab && activeTab.isSplit && (activeTab.id === tab_id || !tab_id)) {
      activeTab.splitRatio = clampedRatio;
      webBar.setSplitRatio(clampedRatio);
    }
  });

  startTelemetryLoop();
}

window.addEventListener("DOMContentLoaded", init);
