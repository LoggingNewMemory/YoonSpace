import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, MemoryStats, SplitBounds } from "../types";

export const tauriIpc = {
  // Window controls
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
      return { resident_mb: 42.0, virtual_mb: 120.0 };
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
  async spawnSplit(leftUrl: string, rightUrl: string, bounds: SplitBounds): Promise<void> {
    try {
      await invoke("spawn_split", {
        req: {
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

  async closeSplit(): Promise<void> {
    try {
      await invoke("close_split");
    } catch (e) {
      console.warn("close_split failed:", e);
    }
  },
};
