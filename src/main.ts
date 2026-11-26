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
import type {
  AppConfig,
  DownloadItem,
  FaviconCachedEvent,
  MinimizedTab,
  SplitBounds,
  SplitPreset,
  SplitRatioChangedEvent,
} from "./types";
import {
  normalizeUrl as normalizeUrlHelper,
  deriveTitleFromInput,
  getTabEffectiveUrl,
  getTabEffectiveTitle,
} from "./utils/url";
import {
  normalizeUrlForCache,
  onFaviconCached,
  setCachedFaviconDataUrl,
} from "./utils/favicon";
import {
  createDragSplitOverlay,
  type DragSplitOverlayController,
} from "./components/split/drag_overlay";
import {
  createSettingsPage,
  type SettingsPageController,
} from "./components/settings_page";
import {
  createMediaController,
  type MediaController,
} from "./components/media_controller";
import {
  createBookmarksController,
  createWelcomeBookmarksSection,
  type BookmarksController,
} from "./components/bookmarks";
import { createHomepageWallpaper } from "./components/wallpaper";

let currentConfig: AppConfig;
let isViewOpen = false;
let activeTab: MinimizedTab | null = null;
let dock: DockController;
let webBar: WebBarController;
let isShieldOpen = false;
let isDownloadOpen = false;
let isMediaOpen = false;
let isBookmarkOpen = false;
let mediaController: MediaController;
let bookmarksController: BookmarksController;
let isSpawning = false;
let dragOverlay: DragSplitOverlayController;
let settingsPage: SettingsPageController;
let isSettingsOpen = false;
let previousViewBeforeSettings: "tab" | "welcome" = "welcome";
let isDropHandled = false;
let mainWrapper: HTMLElement;

function getSplitBounds(): SplitBounds {
  const dockWidth = dock ? dock.getWidth() : 64;
  const leftOffset = isMediaOpen || isBookmarkOpen ? 360 : 0;
  const rightOffset = isShieldOpen || isDownloadOpen ? 360 : 0;
  const headerHeight = 80;
  const webBarHeight = 28;
  const topOffset = headerHeight + webBarHeight;
  return {
    x: dockWidth + leftOffset,
    y: topOffset,
    width: Math.max(300, window.innerWidth - dockWidth - leftOffset - rightOffset),
    height: Math.max(300, window.innerHeight - topOffset),
    split_ratio: activeTab?.isSplit ? (activeTab.splitRatio ?? 0.5) : undefined,
  };
}

function updateShieldForTab(tab: MinimizedTab | null) {
  mediaController?.updateActiveTab(tab);
  bookmarksController?.updateActiveSite(tab, isViewOpen && Boolean(tab));
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
  return normalizeUrlHelper(input, currentConfig.search_engines, activeEngineId);
}

function setOmnibarText(text: string) {
  const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
  if (omnibarInput) {
    omnibarInput.value = text;
    omnibarInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function handleSpawnPreset(preset: SplitPreset) {
  if (isSettingsOpen) {
    isSettingsOpen = false;
    settingsPage?.hide();
  }
  if (isSpawning) {
    console.warn("[YoonSpace] Spawn ignored: already initializing a view");
    return;
  }
  isSpawning = true;
  const tabId = "preset-" + preset.id;

  let leftTitle = deriveTitleFromInput(preset.left_url) || "Left View";
  let rightTitle = deriveTitleFromInput(preset.right_url) || "Right View";
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
    webBar.startProgress("left");
    webBar.startProgress("right");
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(true);

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
  if (isSettingsOpen) {
    isSettingsOpen = false;
    settingsPage?.hide();
  }
  const targetUrl = normalizeUrl(query, engineId);
  const displayTitle = deriveTitleFromInput(query);

  // If a single tab is currently active and open, navigate it in-place instead of creating a new tab!
  if (isViewOpen && activeTab && !activeTab.isSplit) {
    activeTab.url = targetUrl;
    activeTab.query = query;
    activeTab.title = displayTitle;

    dock.updateTabTitle(activeTab.id, displayTitle);
    webBar.setSingleMode(displayTitle);
    webBar.startProgress("single");
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(true);

    setOmnibarText(query);

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
    webBar.startProgress("single");
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(true);

    await tauriIpc.spawnSingleView(targetUrl, bounds, activeTab.id);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSingleMode(displayTitle);
    webBar.show();

    setOmnibarText(query);

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

    setOmnibarText("");
    const welcomeInput = document.getElementById("engineerOmniInput") as HTMLInputElement | null;
    if (welcomeInput) {
      welcomeInput.value = "";
      welcomeInput.dispatchEvent(new Event("input", { bubbles: true }));
      welcomeInput.focus();
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

    setOmnibarText(remainingUrl);

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

    setOmnibarText(remainingUrl);

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

    setOmnibarText(remainingUrl);

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

    setOmnibarText(remainingUrl);

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
  if (isSettingsOpen) {
    isSettingsOpen = false;
    settingsPage?.hide();
  }
  activeTab = tab;
  dock.setActiveTabId(tab.id);

  const bounds = getSplitBounds();

  try {
    const shown = await tauriIpc.showTabView(tab.id, bounds);
    if (!shown) {
      webBar.resetProgress();
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(false);

    if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
        await tauriIpc.spawnSplit(tab.leftUrl, tab.rightUrl, bounds, tab.id);
      } else {
        await tauriIpc.spawnSingleView(tab.url || "", bounds, tab.id);
      }
    }

    webBar.resetProgress();
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(false);

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

    setOmnibarText(tab.url || tab.query || tab.title || "");

    updateShieldForTab(tab);
  } catch (e) {
    console.error("Failed to restore tab:", e);
  }
}

async function handleTabDragStart(tab: MinimizedTab) {
  isDropHandled = false;

  if (isViewOpen && activeTab && activeTab.id !== tab.id) {
    dragOverlay.show(tab.title, getSplitBounds());
    await tauriIpc.setDragMode(true);
  }
}

function handleTabDragMove(_tab: MinimizedTab, x: number, y: number) {
  dragOverlay.updateDragPosition(x, y, getSplitBounds());
}

async function handleTabDragEnd(tab: MinimizedTab, x: number, y: number, targetTabId?: string) {
  dragOverlay.hide();

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
  dragOverlay.hide();

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

  dragOverlay.hide();

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

  dragOverlay.hide();

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

// User clicked Home / Workspaces in dock
async function handleHomeClick() {
  if (isSettingsOpen) {
    isSettingsOpen = false;
    settingsPage?.hide();
  }
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

    setOmnibarText("");
    const welcomeInput = document.getElementById("engineerOmniInput") as HTMLInputElement | null;
    if (welcomeInput) {
      welcomeInput.value = "";
      welcomeInput.dispatchEvent(new Event("input", { bubbles: true }));
      welcomeInput.focus();
    }

    dock.setActiveTabId(null);
  } else {
    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }
    dock.setActiveTabId(null);
  }
}

// Open a bookmarked URL in a dedicated new tab (or switch to Settings off first)
async function handleOpenBookmark(rawUrl: string, title?: string) {
  if (isSettingsOpen) {
    isSettingsOpen = false;
    settingsPage?.hide();
  }
  if (isSpawning) {
    console.warn("[YoonSpace] Open bookmark ignored: already initializing a view");
    return;
  }
  isSpawning = true;

  const targetUrl = normalizeUrlForCache(rawUrl);
  const displayTitle = title?.trim() || deriveTitleFromInput(targetUrl);
  const tabId = "tab-" + Date.now();

  activeTab = {
    id: tabId,
    title: displayTitle,
    url: targetUrl,
    query: targetUrl,
    isSplit: false,
  };

  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    webBar.startProgress("single");
    const headerEl = document.querySelector("header") as any;
    headerEl?.setLoading?.(true);

    await tauriIpc.spawnSingleView(targetUrl, bounds, activeTab.id);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setSingleMode(displayTitle);
    webBar.show();
    setOmnibarText(targetUrl);
    updateShieldForTab(activeTab);
  } catch (e) {
    console.error("Failed to open bookmark:", e);
  } finally {
    isSpawning = false;
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
  dragOverlay?.updateBounds(getSplitBounds());
});

async function handleOpenSettings() {
  if (isSettingsOpen) return;

  previousViewBeforeSettings = isViewOpen ? "tab" : "welcome";
  isSettingsOpen = true;

  if (isViewOpen) {
    try {
      await tauriIpc.hideWebviews();
      setTimeout(refreshTelemetry, 100);
      setTimeout(refreshTelemetry, 300);
    } catch (e) {
      console.error("Failed to hide webviews for settings page:", e);
    }
  }

  webBar.hide();

  const mainCanvas = document.getElementById("main-canvas");
  if (mainCanvas) {
    mainCanvas.classList.add("hidden");
  }

  dock.setActiveTabId("settings");
  settingsPage.show();
  settingsPage.refreshCacheSize().catch(console.error);
}

async function handleBackFromSettings() {
  if (!isSettingsOpen) return;

  isSettingsOpen = false;
  settingsPage.hide();

  if (previousViewBeforeSettings === "tab" && activeTab) {
    isViewOpen = true;
    webBar.show();
    dock.setActiveTabId(activeTab.id);
    const bounds = getSplitBounds();
    try {
      await tauriIpc.showTabView(activeTab.id, bounds);
      setTimeout(refreshTelemetry, 100);
      setTimeout(refreshTelemetry, 300);
    } catch (e) {
      console.error("Failed to restore active tab from settings:", e);
    }
  } else {
    isViewOpen = false;
    webBar.hide();
    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }
    dock.setActiveTabId(null);
  }
}

async function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  currentConfig = await tauriIpc.getAppConfig();

  const handleBack = () => {
    if (isSettingsOpen) {
      handleBackFromSettings();
      return;
    }
    if (isViewOpen && activeTab) {
      if (activeTab.isSplit) {
        webBar.startProgress("left");
      } else {
        webBar.startProgress("single");
      }
      (titlebar as any).setLoading?.(true);
      tauriIpc.goBack(activeTab.id);
    }
  };

  const handleForward = () => {
    if (isViewOpen && activeTab) {
      if (activeTab.isSplit) {
        webBar.startProgress("left");
      } else {
        webBar.startProgress("single");
      }
      (titlebar as any).setLoading?.(true);
      tauriIpc.goForward(activeTab.id);
    }
  };

  const handleReload = () => {
    if (isViewOpen && activeTab) {
      if (activeTab.isSplit) {
        webBar.startProgress("left");
        webBar.startProgress("right");
      } else {
        webBar.startProgress("single");
      }
      (titlebar as any).setLoading?.(true);
      tauriIpc.reload(activeTab.id);
    }
  };

  const updateLayoutOffset = () => {
    const dockWidth = dock ? dock.getWidth() : 64;
    const leftOffset = isMediaOpen || isBookmarkOpen ? 360 : 0;
    const rightOffset = isShieldOpen || isDownloadOpen ? 360 : 0;
    mediaController?.setLeftOffset(dockWidth);
    bookmarksController?.setLeftOffset(dockWidth);
    webBar.setLeftOffset(dockWidth + leftOffset);
    webBar.setRightOffset(rightOffset);
    mainWrapper.style.paddingLeft = `${dockWidth + leftOffset}px`;
    mainWrapper.style.paddingRight = `${rightOffset}px`;
    tauriIpc.setOverlayRightOffset(rightOffset);
    if (isViewOpen) {
      const bounds = getSplitBounds();
      tauriIpc.updateSplitLayout(bounds);
    }
    dragOverlay?.updateBounds(getSplitBounds());
  };

  const handleMediaToggle = (isOpen?: boolean) => {
    isMediaOpen = typeof isOpen === "boolean" ? isOpen : !isMediaOpen;
    if (isMediaOpen) {
      if (isBookmarkOpen) {
        bookmarksController?.hide();
        isBookmarkOpen = false;
        dock?.setBookmarkActive(false);
      }
      mediaController?.show();
      dock?.setMediaActive(true);
    } else {
      mediaController?.hide();
      dock?.setMediaActive(false);
    }
    updateLayoutOffset();
  };

  const handleBookmarkToggle = (isOpen?: boolean) => {
    isBookmarkOpen = typeof isOpen === "boolean" ? isOpen : !isBookmarkOpen;
    if (isBookmarkOpen) {
      if (isMediaOpen) {
        mediaController?.hide();
        isMediaOpen = false;
        dock?.setMediaActive(false);
      }
      bookmarksController?.updateActiveSite(isViewOpen ? activeTab : null, isViewOpen);
      bookmarksController?.show();
      dock?.setBookmarkActive(true);
    } else {
      bookmarksController?.hide();
      dock?.setBookmarkActive(false);
    }
    updateLayoutOffset();
  };

  const handleShieldToggle = (isOpen: boolean) => {
    isShieldOpen = isOpen;
    if (isShieldOpen && isDownloadOpen) {
      (titlebar as any).downloadController?.hideDrawer();
      isDownloadOpen = false;
    }
    updateLayoutOffset();
  };

  const handleDownloadToggle = (isOpen: boolean) => {
    isDownloadOpen = isOpen;
    if (isDownloadOpen && isShieldOpen) {
      (titlebar as any).shieldController?.closePopover();
      isShieldOpen = false;
    }
    updateLayoutOffset();
  };

  // 1. Titlebar (Fixed at top, height: 80px default)
  const titlebar = createTitlebar(
    (url) => handleSearch(url, currentConfig.active_search_engine),
    handleHomeClick,
    handleBack,
    handleForward,
    handleReload,
    handleShieldToggle,
    handleDownloadToggle,
    handleOpenSettings
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
  mainWrapper = document.createElement("div");
  mainWrapper.className =
    "pl-16 min-h-screen pt-20 flex flex-col justify-start items-center bg-[#131313] overflow-y-auto transition-[padding] duration-200 ease-out";

  // 3. Dock with Arc / Zen Collapsible Sidebar
  dock = createDock(
    (tabId) => {
      if (tabId === "home" || tabId === "workspaces") {
        if (isSettingsOpen) {
          isSettingsOpen = false;
          settingsPage?.hide();
        }
        handleHomeClick();
      } else if (tabId === "bookmarks") {
        handleBookmarkToggle();
      } else if (tabId === "settings") {
        if (isSettingsOpen) {
          handleBackFromSettings();
        } else {
          handleOpenSettings();
        }
      }
    },
    handleRestoreTab,
    handleCloseTab,
    () => handleBookmarkToggle(),
    (isExpanded) => {
      const dockWidth = isExpanded ? 220 : 64;
      mediaController?.setLeftOffset(dockWidth);
      bookmarksController?.setLeftOffset(dockWidth);
      const leftOffset = isMediaOpen || isBookmarkOpen ? 360 : 0;
      webBar.setLeftOffset(dockWidth + leftOffset);
      mainWrapper.style.paddingLeft = `${dockWidth + leftOffset}px`;
      if (isViewOpen) {
        const bounds = getSplitBounds();
        tauriIpc.updateSplitLayout(bounds);
      }
      dragOverlay?.updateBounds(getSplitBounds());
    },
    handleTabDragStart,
    handleTabDragEnd,
    handleTabDropOnTab,
    handleTabDragMove,
    handleTabDragCancel,
    (tab, pane) => {
      handleSplitWithActive(tab, pane);
    },
    () => {
      handleMediaToggle();
    }
  );
  app.appendChild(dock.element);

  // Music & Media Controller (Left Drawer adjacent to Dock)
  mediaController = createMediaController(
    () => {
      isMediaOpen = false;
      dock.setMediaActive(false);
      updateLayoutOffset();
    },
    (url) => {
      handleSearch(url, currentConfig.active_search_engine);
    },
    (tabId) => {
      const tab = dock.getTab(tabId);
      if (tab) {
        handleRestoreTab(tab);
      }
    },
    (isPlaying) => {
      dock.setMediaPlaying(isPlaying);
    },
    currentConfig.media_volume ?? 100,
    (volumePct) => {
      currentConfig.media_volume = volumePct;
    }
  );
  mediaController.setLeftOffset(dock.getWidth());

  // Welcome screen bookmarks quick-access section
  const welcomeBookmarks = createWelcomeBookmarksSection(
    (url, title) => handleOpenBookmark(url, title),
    () => handleBookmarkToggle(true)
  );

  // Bookmarks Drawer (Left Drawer adjacent to Dock, triggered by + button)
  bookmarksController = createBookmarksController(
    () => {
      isBookmarkOpen = false;
      dock.setBookmarkActive(false);
      updateLayoutOffset();
    },
    (url, title) => {
      handleOpenBookmark(url, title);
    },
    (bookmarksList) => {
      welcomeBookmarks.render(bookmarksList);
    }
  );
  bookmarksController.setLeftOffset(dock.getWidth());

  // Drag Split Overlay for dropping tab onto active view
  dragOverlay = createDragSplitOverlay();
  app.appendChild(dragOverlay.element);

  const homepageWallpaper = createHomepageWallpaper((transparency, persist) => {
    if (!currentConfig.wallpaper_settings) {
      currentConfig.wallpaper_settings = {
        folder_path: "",
        transparency,
        order: "randomized",
        change_interval_secs: 0,
      };
    } else {
      currentConfig.wallpaper_settings.transparency = transparency;
    }
    if (persist) {
      void tauriIpc.updateAppConfig(currentConfig);
    }
  });

  // Settings Page with Cache, Search Engine, Shields & Preferences
  settingsPage = createSettingsPage(
    currentConfig,
    async (newConfig) => {
      currentConfig = newConfig;
      await tauriIpc.updateAppConfig(newConfig);
      welcome.refreshEngines(newConfig);
      (titlebar as any).downloadController?.refresh();
      void homepageWallpaper.applySettings(newConfig.wallpaper_settings);
    },
    handleBackFromSettings
  );
  mainWrapper.appendChild(settingsPage.element);

  // Navigation keyboard shortcuts: Reload (Ctrl+R / F5), Back (Alt+Left), Forward (Alt+Right), Settings (Ctrl+,)
  window.addEventListener("keydown", (e) => {
    // 0. Settings (Ctrl+, / Cmd+,)
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      if (isSettingsOpen) {
        handleBackFromSettings();
      } else {
        handleOpenSettings();
      }
    }
    // 0b. Bookmarks (Ctrl+D / Cmd+D)
    else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      handleBookmarkToggle();
    }
    // Escape closes Bookmarks, Media, or Settings if open
    else if (e.key === "Escape") {
      if (isBookmarkOpen) {
        e.preventDefault();
        handleBookmarkToggle(false);
      } else if (isMediaOpen) {
        e.preventDefault();
        handleMediaToggle(false);
      } else if (isSettingsOpen) {
        e.preventDefault();
        handleBackFromSettings();
      }
    }
    // 1. Reload (Ctrl+R / Cmd+R / F5)
    else if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
      if (isSettingsOpen) {
        e.preventDefault();
        settingsPage.refreshCacheSize().catch(console.error);
        settingsPage.refreshVault().catch(console.error);
      } else if (isViewOpen && activeTab) {
        e.preventDefault();
        handleReload();
      } else {
        e.preventDefault();
        window.location.reload();
      }
    }
    // 2. Back (Alt+Left / Alt+ArrowLeft / Cmd+[)
    else if (((e.altKey && (e.key === "ArrowLeft" || e.key === "Left")) || (e.metaKey && e.key === "["))) {
      if (isSettingsOpen) {
        e.preventDefault();
        handleBackFromSettings();
      } else if (isViewOpen && activeTab) {
        e.preventDefault();
        handleBack();
      }
    }
    // 3. Forward (Alt+Right / Alt+ArrowRight / Cmd+])
    else if (((e.altKey && (e.key === "ArrowRight" || e.key === "Right")) || (e.metaKey && e.key === "]")) && isViewOpen && activeTab && !isSettingsOpen) {
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
    handleSpawnPreset,
    async (updatedPresets) => {
      currentConfig.split_presets = updatedPresets;
      await tauriIpc.updateAppConfig(currentConfig);
    }
  );
  welcome.classList.add("relative", "z-10");
  welcome.appendChild(welcomeBookmarks.element);
  welcome.appendChild(presets);

  main.appendChild(homepageWallpaper.layerElement);
  main.appendChild(welcome);
  main.appendChild(homepageWallpaper.controlsElement);
  mainWrapper.appendChild(main);
  app.appendChild(mainWrapper);

  void homepageWallpaper.applySettings(currentConfig.wallpaper_settings);

  // Autofocus welcome search bar on initial application launch
  setTimeout(() => {
    const welcomeInput = document.getElementById("engineerOmniInput") as HTMLInputElement | null;
    welcomeInput?.focus();
  }, 100);

  // 5. Real-time document title updates from WebKit
  tauriIpc.listen<string>("webview-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && !activeTab.isSplit) {
      activeTab.title = event.payload;
      webBar.setSingleMode(event.payload);
      dock.updateTabTitle(activeTab.id, event.payload);
      mediaController?.updateActiveTab(activeTab);
      bookmarksController?.updateActiveSite(activeTab, isViewOpen);
    }
  });

  tauriIpc.listen<string>("webview-split-left-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && activeTab.isSplit) {
      activeTab.leftTitle = event.payload;
      webBar.setLeftTitle(event.payload);
      const combined = `${event.payload} | ${activeTab.rightTitle || "Right"}`;
      activeTab.title = combined;
      dock.updateTabTitle(activeTab.id, combined, event.payload, activeTab.rightTitle);
      mediaController?.updateActiveTab(activeTab);
      bookmarksController?.updateActiveSite(activeTab, isViewOpen);
    }
  });

  tauriIpc.listen<string>("webview-split-right-title-changed", (event) => {
    if (event.payload && isViewOpen && activeTab && activeTab.isSplit) {
      activeTab.rightTitle = event.payload;
      webBar.setRightTitle(event.payload);
      const combined = `${activeTab.leftTitle || "Left"} | ${event.payload}`;
      activeTab.title = combined;
      dock.updateTabTitle(activeTab.id, combined, activeTab.leftTitle, event.payload);
      mediaController?.updateActiveTab(activeTab);
      bookmarksController?.updateActiveSite(activeTab, isViewOpen);
    }
  });

  // 5c. Detected & cached site logos from native WebViews
  tauriIpc.listen<FaviconCachedEvent>("webview-favicon-cached", (event) => {
    const payload = event.payload;
    if (!payload?.url || !payload?.data_url) return;
    setCachedFaviconDataUrl(payload.url, payload.data_url);
  });

  onFaviconCached(() => {
    dock.refreshIcons();
    bookmarksController?.updateActiveSite(isViewOpen ? activeTab : null, isViewOpen);
    welcomeBookmarks.render(bookmarksController.getBookmarks());
  });

  // 5b. Real-time HTML5 media playback state from active WebView
  tauriIpc.listen<{
    tabId?: string;
    hasMedia: boolean;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    muted: boolean;
    title: string;
    artist: string;
  }>("webview-media-state", (event) => {
    const payload = event.payload;
    if (!payload || !activeTab) return;
    if (
      !payload.tabId ||
      payload.tabId === activeTab.id ||
      payload.tabId.startsWith(`${activeTab.id}_`)
    ) {
      mediaController?.updateMediaState(payload);
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
        setOmnibarText(url);
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

  // 9. Real-time Download Events (WebKitGTK Downloads)
  tauriIpc.listen<DownloadItem>("download-started", (event) => {
    (titlebar as any).downloadController?.upsertItem(event.payload);
  });

  tauriIpc.listen<DownloadItem>("download-progress", (event) => {
    (titlebar as any).downloadController?.upsertItem(event.payload);
  });

  tauriIpc.listen<DownloadItem>("download-completed", (event) => {
    (titlebar as any).downloadController?.upsertItem(event.payload);
  });

  tauriIpc.listen<DownloadItem>("download-failed", (event) => {
    (titlebar as any).downloadController?.upsertItem(event.payload);
  });

  tauriIpc.listen<DownloadItem>("download-cancelled", (event) => {
    (titlebar as any).downloadController?.upsertItem(event.payload);
  });

  // 10. Real-time Webview Load Progress Bar (Color is Orange #f85e2a / #ff7843)
  tauriIpc.listen<{ tab_id: string; progress: number; status: string }>(
    "webview-load-progress",
    (event) => {
      const { tab_id, progress, status } = event.payload;
      if (!isViewOpen || !activeTab) return;

      if (!activeTab.isSplit) {
        if (tab_id === activeTab.id || tab_id === "single_view") {
          if (status === "started") {
            webBar.startProgress("single");
            (titlebar as any).setLoading?.(true);
          } else if (status === "finished" || status === "failed") {
            webBar.finishProgress("single");
            (titlebar as any).setLoading?.(false);
          } else {
            webBar.setProgress(progress, "single");
            if (progress >= 1.0) {
              (titlebar as any).setLoading?.(false);
            }
          }
        }
      } else {
        const isLeft = tab_id === `${activeTab.id}_left` || tab_id === "split_left";
        const isRight = tab_id === `${activeTab.id}_right` || tab_id === "split_right";
        if (isLeft) {
          if (status === "started") {
            webBar.startProgress("left");
            (titlebar as any).setLoading?.(true);
          } else if (status === "finished" || status === "failed") {
            webBar.finishProgress("left");
            (titlebar as any).setLoading?.(false);
          } else {
            webBar.setProgress(progress, "left");
            if (progress >= 1.0) {
              (titlebar as any).setLoading?.(false);
            }
          }
        } else if (isRight) {
          if (status === "started") {
            webBar.startProgress("right");
            (titlebar as any).setLoading?.(true);
          } else if (status === "finished" || status === "failed") {
            webBar.finishProgress("right");
            (titlebar as any).setLoading?.(false);
          } else {
            webBar.setProgress(progress, "right");
            if (progress >= 1.0) {
              (titlebar as any).setLoading?.(false);
            }
          }
        }
      }
    }
  );

  startTelemetryLoop();
  (window as any).tauriIpc = tauriIpc;
}

window.addEventListener("DOMContentLoaded", init);
