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

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppConfig, MemoryStats, SplitBounds } from "../types";

export const tauriIpc = {
  // Event listening
  listen<T>(event: string, handler: (event: { event: string; payload: T }) => void): Promise<UnlistenFn> {
    return listen<T>(event, handler);
  },
  // Window controls
  async startDragging(): Promise<void> {
    try {
      await invoke("window_start_dragging");
    } catch (e) {
      console.warn("window_start_dragging failed:", e);
    }
  },

  async minimizeWindow(): Promise<void> {
    try {
      await invoke("window_minimize");
    } catch (e) {
      console.warn("window_minimize failed:", e);
    }
  },

  async toggleMaximizeWindow(): Promise<void> {
    try {
      await invoke("window_toggle_maximize");
    } catch (e) {
      console.warn("window_toggle_maximize failed:", e);
    }
  },

  async closeWindow(): Promise<void> {
    try {
      await invoke("window_close");
    } catch (e) {
      console.warn("window_close failed:", e);
    }
  },

  async isWindowMaximized(): Promise<boolean> {
    try {
      return await invoke<boolean>("window_is_maximized");
    } catch {
      return false;
    }
  },

  // Telemetry
  async getTelemetry(): Promise<MemoryStats> {
    try {
      return await invoke<MemoryStats>("get_telemetry");
    } catch (e) {
      console.warn("get_telemetry failed:", e);
      return { resident_mb: 42.0, total_rss_mb: 180.0, shared_mb: 138.0, virtual_mb: 500.0 };
    }
  },

  // Config
  async getAppConfig(): Promise<AppConfig> {
    try {
      return await invoke<AppConfig>("get_app_config");
    } catch (e) {
      console.warn("get_app_config failed, returning fallback:", e);
      return {
        active_search_engine: "google",
        search_engines: [
          {
            id: "google",
            name: "Google",
            query_url: "https://www.google.com/search?q=",
            icon: "travel_explore",
          },
          {
            id: "duckduckgo",
            name: "DuckDuckGo",
            query_url: "https://duckduckgo.com/?q=",
            icon: "search",
          },
        ],
        split_presets: [
          {
            id: "gemini_notebook",
            title: "Gemini | NotebookLM",
            icon: "view_column",
            left_url: "https://gemini.google.com",
            right_url: "https://notebooklm.google.com",
          },
          {
            id: "github_jira",
            title: "GitHub | JIRA",
            icon: "troubleshoot",
            left_url: "https://github.com",
            right_url: "https://www.atlassian.com/software/jira",
          },
          {
            id: "claude_youtube",
            title: "Claude | YouTube",
            icon: "school",
            left_url: "https://claude.ai",
            right_url: "https://www.youtube.com",
          },
        ],
      };
    }
  },

  async updateAppConfig(config: AppConfig): Promise<void> {
    try {
      await invoke("update_app_config", { config });
    } catch (e) {
      console.warn("update_app_config failed:", e);
    }
  },

  // WebViews
  async spawnSingleView(url: string, bounds: SplitBounds, tabId?: string): Promise<void> {
    try {
      await invoke("spawn_single_view", {
        req: {
          tab_id: tabId,
          url,
          bounds,
        },
      });
    } catch (e) {
      console.error("spawn_single_view failed:", e);
      throw e;
    }
  },

  async spawnSplit(leftUrl: string, rightUrl: string, bounds: SplitBounds, tabId?: string): Promise<void> {
    try {
      await invoke("spawn_split", {
        req: {
          tab_id: tabId,
          left_url: leftUrl,
          right_url: rightUrl,
          bounds,
        },
      });
    } catch (e) {
      console.error("spawn_split failed:", e);
      throw e;
    }
  },

  async updateSplitLayout(bounds: SplitBounds): Promise<void> {
    try {
      await invoke("update_split_layout", { bounds });
    } catch (e) {
      console.warn("update_split_layout failed:", e);
    }
  },

  async navigateSplit(pane: "left" | "right", url: string): Promise<void> {
    try {
      await invoke("navigate_split", { pane, url });
    } catch (e) {
      console.warn("navigate_split failed:", e);
    }
  },

  async checkSplitActive(): Promise<boolean> {
    try {
      return await invoke<boolean>("check_split_active");
    } catch {
      return false;
    }
  },

  async hideWebviews(): Promise<void> {
    try {
      await invoke("hide_webviews");
    } catch (e) {
      console.warn("hide_webviews failed:", e);
    }
  },

  async closeTab(tabId: string): Promise<void> {
    try {
      await invoke("close_tab", { tabId });
    } catch (e) {
      console.warn("close_tab failed:", e);
    }
  },

  async closeSplit(): Promise<void> {
    try {
      await invoke("close_split");
    } catch (e) {
      console.warn("close_split failed:", e);
    }
  },
};
