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
import { createDock } from "./components/dock";
import { createWelcomeScreen } from "./components/welcome";
import { createSplitPresetsSection } from "./components/split_presets";
import type { AppConfig, SplitBounds, SplitPreset } from "./types";

let currentConfig: AppConfig;
let isSplitViewOpen = false;

function getSplitBounds(): SplitBounds {
  const dockWidth = 64;
  const headerHeight = 80;
  return {
    x: dockWidth,
    y: headerHeight,
    width: Math.max(300, window.innerWidth - dockWidth),
    height: Math.max(300, window.innerHeight - headerHeight),
  };
}

function normalizeUrl(input: string, activeEngineId: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://google.com";

  // If already full url
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If domain-like (e.g. github.com, localhost:3000, sub.domain.org/path)
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed) || /^localhost(:\d+)?/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // Otherwise, use search engine
  const engine =
    currentConfig.search_engines.find((e) => e.id === activeEngineId) ||
    currentConfig.search_engines[0];
  return `${engine.query_url}${encodeURIComponent(trimmed)}`;
}

async function handleSpawnPreset(preset: SplitPreset) {
  const bounds = getSplitBounds();
  try {
    await tauriIpc.spawnSplit(preset.left_url, preset.right_url, bounds);
    isSplitViewOpen = true;

    // Update titlebar indicator
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
  // Spawn target url on left, and google search on right or standard split
  const bounds = getSplitBounds();
  await tauriIpc.spawnSplit(targetUrl, "https://google.com", bounds);
  isSplitViewOpen = true;

  const indicator = document.getElementById("split-active-indicator");
  if (indicator) {
    indicator.classList.remove("hidden");
    indicator.classList.add("flex");
    indicator.querySelector("span:nth-child(2)")!.textContent = query;
  }
}

async function handleHomeClick() {
  if (isSplitViewOpen) {
    await tauriIpc.closeSplit();
    isSplitViewOpen = false;
    const indicator = document.getElementById("split-active-indicator");
    if (indicator) {
      indicator.classList.add("hidden");
      indicator.classList.remove("flex");
    }
  }
}

async function startTelemetryLoop() {
  const ramBadge = document.getElementById("telemetry-ram");
  const update = async () => {
    const stats = await tauriIpc.getTelemetry();
    if (ramBadge) {
      ramBadge.textContent = `${stats.resident_mb.toFixed(0)} MB RAM`;
    }
  };

  await update();
  setInterval(update, 2500);
}

// Window resize handler for child webviews
window.addEventListener("resize", () => {
  if (isSplitViewOpen) {
    const bounds = getSplitBounds();
    tauriIpc.updateSplitLayout(bounds);
  }
});

async function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  currentConfig = await tauriIpc.getAppConfig();

  // Create Titlebar
  const titlebar = createTitlebar(
    (url) => handleSearch(url, currentConfig.active_search_engine),
    handleHomeClick
  );
  app.appendChild(titlebar);

  // Create Dock
  const dock = createDock((tabId) => {
    if (tabId === "home") {
      handleHomeClick();
    }
  });
  app.appendChild(dock);

  // Main Canvas
  const mainWrapper = document.createElement("div");
  mainWrapper.className =
    "pl-16 min-h-screen pt-20 flex flex-col justify-center items-center bg-[#131313] overflow-y-auto";

  const main = document.createElement("main");
  main.id = "main-canvas";
  main.className =
    "relative w-full flex-1 flex flex-col items-center justify-center p-6 md:p-10";

  // Welcome Screen
  const welcome = createWelcomeScreen(
    currentConfig,
    handleSearch,
    async (engineId) => {
      currentConfig.active_search_engine = engineId;
      await tauriIpc.updateAppConfig(currentConfig);
    }
  );

  // Split Presets
  const presets = createSplitPresetsSection(
    currentConfig.split_presets,
    handleSpawnPreset
  );
  welcome.appendChild(presets);

  main.appendChild(welcome);
  mainWrapper.appendChild(main);
  app.appendChild(mainWrapper);

  // Start memory telemetry
  startTelemetryLoop();
}

window.addEventListener("DOMContentLoaded", init);
