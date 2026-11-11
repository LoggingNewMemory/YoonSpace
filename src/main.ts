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
  const dockWidth = 64;
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
  // If a tab is already open, minimize it to the sidebar
  if (isViewOpen && activeTab) {
    dock.addMinimizedTab(activeTab);
  }

  const bounds = getSplitBounds();
  const tabId = "preset-" + preset.id;
  activeTab = {
    id: tabId,
    title: preset.title,
    url: preset.left_url,
    query: preset.title,
    isSplit: true,
    leftUrl: preset.left_url,
    rightUrl: preset.right_url,
  };

  try {
    await tauriIpc.spawnSplit(preset.left_url, preset.right_url, bounds);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setTitle(preset.title);
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
  // If a tab is already open, minimize it to the sidebar
  if (isViewOpen && activeTab) {
    dock.addMinimizedTab(activeTab);
  }

  const targetUrl = normalizeUrl(query, engineId);
  const bounds = getSplitBounds();
  const displayTitle = deriveTitleFromInput(query);
  const tabId = "tab-" + Date.now();

  activeTab = {
    id: tabId,
    title: displayTitle,
    url: targetUrl,
    query: query,
    isSplit: false,
  };

  try {
    await tauriIpc.spawnSingleView(targetUrl, bounds);
    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setTitle(displayTitle);
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

// User clicked Minimize on top web bar -> goes to the sidebar dock
async function handleMinimizeWeb() {
  if (activeTab) {
    dock.addMinimizedTab({ ...activeTab });
  }

  try {
    await tauriIpc.closeSplit();
  } catch (e) {
    console.error("Failed to close webview on minimize:", e);
  }

  isViewOpen = false;
  activeTab = null;
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

  dock.setActiveTab("dock-btn-workspaces");
}

// User clicked Close on top web bar -> closes tab
async function handleCloseWeb() {
  if (activeTab) {
    dock.removeMinimizedTab(activeTab.id);
  }

  try {
    await tauriIpc.closeSplit();
  } catch (e) {
    console.error("Failed to close webview on close:", e);
  }

  isViewOpen = false;
  activeTab = null;
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

  dock.setActiveTab("dock-btn-workspaces");
}

// User clicked on a minimized tab on the sidebar dock -> restores it
async function handleRestoreTab(tab: MinimizedTab) {
  // If another tab is open, minimize it first
  if (isViewOpen && activeTab && activeTab.id !== tab.id) {
    dock.addMinimizedTab(activeTab);
  }

  const bounds = getSplitBounds();
  activeTab = tab;
  dock.removeMinimizedTab(tab.id);

  try {
    if (tab.isSplit && tab.leftUrl && tab.rightUrl) {
      await tauriIpc.spawnSplit(tab.leftUrl, tab.rightUrl, bounds);
      const indicator = document.getElementById("split-active-indicator");
      if (indicator) {
        indicator.classList.remove("hidden");
        indicator.classList.add("flex");
        indicator.querySelector("span:nth-child(2)")!.textContent = tab.title;
      }
    } else {
      await tauriIpc.spawnSingleView(tab.url, bounds);
      const indicator = document.getElementById("split-active-indicator");
      if (indicator) {
        indicator.classList.add("hidden");
        indicator.classList.remove("flex");
      }
    }

    isViewOpen = true;

    const mainCanvas = document.getElementById("main-canvas");
    if (mainCanvas) {
      mainCanvas.classList.add("hidden");
    }

    webBar.setTitle(tab.title);
    webBar.show();

    const omnibarInput = document.getElementById("global-omnibar-input") as HTMLInputElement | null;
    if (omnibarInput) {
      omnibarInput.value = tab.query || tab.title || tab.url;
    }
  } catch (e) {
    console.error("Failed to restore tab:", e);
  }
}

// User clicked Home / Workspaces in dock
async function handleHomeClick() {
  if (isViewOpen) {
    await handleMinimizeWeb();
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
      badgeContainer.title = `Private RAM: ${stats.resident_mb} MB\nTotal RSS: ${stats.total_rss_mb} MB (incl. shared OS libs)\nShared Libs: ${stats.shared_mb} MB`;
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

  // 1. Titlebar (Fixed at top, height: 80px)
  const titlebar = createTitlebar(
    (url) => handleSearch(url, currentConfig.active_search_engine),
    handleHomeClick
  );
  app.appendChild(titlebar);

  // 2. Dock (Fixed at left: 0, top: 80px, width: 64px) with Minimized Tabs support
  dock = createDock(
    (tabId) => {
      if (tabId === "home" || tabId === "workspaces") {
        handleHomeClick();
      }
    },
    handleRestoreTab
  );
  app.appendChild(dock.element);

  // 3. Web Header Bar (Fixed at top: 80px, left: 64px, right: 0, height: 28px)
  webBar = createWebBar(handleMinimizeWeb, handleCloseWeb);
  app.appendChild(webBar.element);

  // 4. Main Canvas & Welcome Screen
  const mainWrapper = document.createElement("div");
  mainWrapper.className =
    "pl-16 min-h-screen pt-20 flex flex-col justify-center items-center bg-[#131313] overflow-y-auto";

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
      webBar.setTitle(event.payload);
    }
  });

  startTelemetryLoop();
}

window.addEventListener("DOMContentLoaded", init);
