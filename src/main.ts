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
import type { AppConfig, MinimizedTab, SplitBounds, SplitPreset } from "./types";

let currentConfig: AppConfig;
let isViewOpen = false;
let activeTab: MinimizedTab | null = null;
let dock: DockController;
let webBar: WebBarController;

function getSplitBounds(): SplitBounds {
  const dockWidth = dock ? dock.getWidth() : 64;
  const headerHeight = 80;
  const webBarHeight = 28;
  const topOffset = headerHeight + webBarHeight;
  return {
    x: dockWidth,
    y: topOffset,
    width: Math.max(300, window.innerWidth - dockWidth),
    height: Math.max(300, window.innerHeight - topOffset),
  };
}

function normalizeUrl(input: string, activeEngineId: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://google.com";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed) || /^localhost(:\d+)?/i.test(trimmed)) {
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

    webBar.setSplitMode(leftTitle, rightTitle);
    webBar.show();

    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.remove("hidden");
      indicator.classList.add("flex");
      indicator.querySelector("span:nth-child(2)")!.textContent = preset.title;
    }
  } catch (e) {
    console.error("Failed to spawn preset:", e);
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
    } catch (e) {
      console.error("Failed to navigate current tab:", e);
    }
    return;
  }

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

    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  } catch (e) {
    console.error("Failed to spawn single view:", e);
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
    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }

    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
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

  const leftTab: MinimizedTab = {
    id: "tab-" + Date.now(),
    title: activeTab.leftTitle || "Web Tab",
    url: activeTab.leftUrl,
    isSplit: false,
  };
  dock.addTab(leftTab);

  const remainingUrl = activeTab.rightUrl;
  const remainingTitle = activeTab.rightTitle || "Web View";

  activeTab = {
    id: "tab-" + (Date.now() + 1),
    title: remainingTitle,
    url: remainingUrl,
    isSplit: false,
  };
  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    webBar.setSingleMode(remainingTitle);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  } catch (e) {
    console.error("Failed to minimize left tab:", e);
  }
}

// User clicked Close on Left pane of dual split view
async function handleCloseLeft() {
  if (!activeTab || !activeTab.isSplit || !activeTab.rightUrl) {
    await handleCloseWeb();
    return;
  }

  const remainingUrl = activeTab.rightUrl;
  const remainingTitle = activeTab.rightTitle || "Web View";

  activeTab = {
    id: "tab-" + Date.now(),
    title: remainingTitle,
    url: remainingUrl,
    isSplit: false,
  };
  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    webBar.setSingleMode(remainingTitle);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  } catch (e) {
    console.error("Failed to convert split to single on close left:", e);
  }
}

// User clicked Minimize on Right pane of dual split view
async function handleMinimizeRight() {
  if (!activeTab || !activeTab.isSplit || !activeTab.leftUrl || !activeTab.rightUrl) {
    await handleMinimizeWeb();
    return;
  }

  const rightTab: MinimizedTab = {
    id: "tab-" + Date.now(),
    title: activeTab.rightTitle || "Web Tab",
    url: activeTab.rightUrl,
    isSplit: false,
  };
  dock.addTab(rightTab);

  const remainingUrl = activeTab.leftUrl;
  const remainingTitle = activeTab.leftTitle || "Web View";

  activeTab = {
    id: "tab-" + (Date.now() + 1),
    title: remainingTitle,
    url: remainingUrl,
    isSplit: false,
  };
  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    webBar.setSingleMode(remainingTitle);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  } catch (e) {
    console.error("Failed to minimize right tab:", e);
  }
}

// User clicked Close on Right pane of dual split view
async function handleCloseRight() {
  if (!activeTab || !activeTab.isSplit || !activeTab.leftUrl) {
    await handleCloseWeb();
    return;
  }

  const remainingUrl = activeTab.leftUrl;
  const remainingTitle = activeTab.leftTitle || "Web View";

  activeTab = {
    id: "tab-" + Date.now(),
    title: remainingTitle,
    url: remainingUrl,
    isSplit: false,
  };
  dock.addTab(activeTab);
  dock.setActiveTabId(activeTab.id);

  const bounds = getSplitBounds();

  try {
    await tauriIpc.spawnSingleView(remainingUrl, bounds, activeTab.id);
    webBar.setSingleMode(remainingTitle);
    setTimeout(refreshTelemetry, 100);
    setTimeout(refreshTelemetry, 300);
    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  } catch (e) {
    console.error("Failed to convert split to single on close right:", e);
  }
}

// User clicked on a tab on the sidebar dock -> restores / activates it
async function handleRestoreTab(tab: MinimizedTab) {
  activeTab = tab;
  dock.setActiveTabId(tab.id);

  const bounds = getSplitBounds();

  try {
    if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
      await tauriIpc.spawnSplit(tab.leftUrl, tab.rightUrl, bounds, tab.id);
      const indicator = document.getElementById("split-active-indicator");
      if (indicator) {
        indicator.classList.remove("hidden");
        indicator.classList.add("flex");
        indicator.querySelector("span:nth-child(2)")!.textContent = tab.title;
      }
      let leftTitle = tab.leftTitle || "Left Pane";
      let rightTitle = tab.rightTitle || "Right Pane";
      if (!tab.leftTitle && tab.title.includes("|")) {
        const parts = tab.title.split("|").map((p) => p.trim());
        leftTitle = parts[0] || leftTitle;
        rightTitle = parts[1] || rightTitle;
      }
      webBar.setSplitMode(leftTitle, rightTitle);
      webBar.show();
    } else {
      await tauriIpc.spawnSingleView(tab.url || "", bounds, tab.id);
      const indicator = document.getElementById("split-active-indicator");
      if (indicator) {
        indicator.classList.add("hidden");
        indicator.classList.remove("flex");
      }
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
  } catch (e) {
    console.error("Failed to restore tab:", e);
  }
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

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.remove("hidden");
    }

    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
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

  // 1. Titlebar (Fixed at top, height: 80px)
  const titlebar = createTitlebar(
    (url) => handleSearch(url, currentConfig.active_search_engine),
    handleHomeClick,
    handleBack,
    handleForward,
    handleReload
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
    }
  );
  app.appendChild(dock.element);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar (Arc / Zen style)
  // Navigation shortcuts: Alt+Left (Back), Alt+Right (Forward), F5/Ctrl+R (Reload)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      dock.toggleExpanded();
    } else if ((e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) && isViewOpen && activeTab) {
      e.preventDefault();
      handleReload();
    } else if (e.altKey && e.key === "ArrowLeft" && isViewOpen && activeTab) {
      e.preventDefault();
      handleBack();
    } else if (e.altKey && e.key === "ArrowRight" && isViewOpen && activeTab) {
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
    }
  });

  startTelemetryLoop();
}

window.addEventListener("DOMContentLoaded", init);
