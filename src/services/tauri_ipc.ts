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
import type {
  AppConfig,
  CacheInfo,
  DownloadItem,
  EngineerToken,
  MemoryStats,
  SavedCredential,
  ShieldBlockEvent,
  ShieldSettings,
  ShieldStats,
  SplitBounds,
  TabBreakdown,
  VaultStats,
  WebviewLoadProgressEvent,
} from "../types";

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

  async setSplitRatio(ratio: number, tabId?: string): Promise<void> {
    try {
      await invoke("set_split_ratio", { tabId, ratio });
    } catch (e) {
      console.warn("set_split_ratio failed:", e);
    }
  },

  async navigateSplit(pane: "left" | "right", url: string): Promise<void> {
    try {
      await invoke("navigate_split", { pane, url });
    } catch (e) {
      console.warn("navigate_split failed:", e);
    }
  },

  async navigateTab(tabId: string, url: string): Promise<void> {
    try {
      await invoke("navigate_tab", { tabId, url });
    } catch (e) {
      console.error("navigate_tab failed:", e);
      throw e;
    }
  },

  async goBack(tabId: string): Promise<void> {
    try {
      await invoke("webview_go_back", { tabId });
    } catch (e) {
      console.warn("webview_go_back failed:", e);
    }
  },

  async goForward(tabId: string): Promise<void> {
    try {
      await invoke("webview_go_forward", { tabId });
    } catch (e) {
      console.warn("webview_go_forward failed:", e);
    }
  },

  async reload(tabId: string): Promise<void> {
    try {
      await invoke("webview_reload", { tabId });
    } catch (e) {
      console.warn("webview_reload failed:", e);
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

  async setDragMode(active: boolean): Promise<void> {
    try {
      await invoke("set_drag_mode", { active });
    } catch (e) {
      console.warn("set_drag_mode failed:", e);
    }
  },

  async showTabView(tabId: string, bounds: SplitBounds): Promise<boolean> {
    try {
      return (await invoke<boolean>("show_tab_view", { tabId, bounds })) ?? false;
    } catch (e) {
      console.warn("show_tab_view failed:", e);
      return false;
    }
  },

  async minimizeSplitPane(
    tabId: string,
    paneToMinimize: "left" | "right",
    minimizedTabId: string,
    bounds: SplitBounds
  ): Promise<boolean> {
    try {
      return (
        (await invoke<boolean>("minimize_split_pane", {
          tabId,
          paneToMinimize,
          minimizedTabId,
          bounds,
        })) ?? false
      );
    } catch (e) {
      console.warn("minimize_split_pane failed:", e);
      return false;
    }
  },

  async mergeTabsToSplit(
    activeTabId: string,
    otherTabId: string,
    otherPane: "left" | "right",
    bounds: SplitBounds
  ): Promise<boolean> {
    try {
      return (
        (await invoke<boolean>("merge_tabs_to_split", {
          activeTabId,
          otherTabId,
          otherPane,
          bounds,
        })) ?? false
      );
    } catch (e) {
      console.warn("merge_tabs_to_split failed:", e);
      return false;
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

  // YoonSpace Shields (Powered by Brave adblock-rust)
  async getShieldStats(): Promise<ShieldStats> {
    try {
      return await invoke<ShieldStats>("get_shield_stats");
    } catch (e) {
      console.warn("get_shield_stats failed:", e);
      return {
        enabled: true,
        block_trackers: true,
        upgrade_https: true,
        aggressive_sandbox: false,
        total_blocked: 0,
        total_breakdown: { total: 0, trackers: 0, ads: 0, miners: 0 },
        tab_blocked: {},
        tab_breakdown: {},
        recent_blocked: [],
      };
    }
  },

  async updateShieldSettings(settings: ShieldSettings): Promise<ShieldStats> {
    try {
      return await invoke<ShieldStats>("update_shield_settings", { settings });
    } catch (e) {
      console.warn("update_shield_settings failed:", e);
      return this.getShieldStats();
    }
  },

  async toggleShield(enabled: boolean): Promise<boolean> {
    try {
      return await invoke<boolean>("toggle_shield", { enabled });
    } catch (e) {
      console.warn("toggle_shield failed:", e);
      return enabled;
    }
  },

  async toggleShieldTrackers(enabled: boolean): Promise<boolean> {
    try {
      return await invoke<boolean>("toggle_shield_trackers", { enabled });
    } catch (e) {
      console.warn("toggle_shield_trackers failed:", e);
      return enabled;
    }
  },

  async toggleShieldHttps(enabled: boolean): Promise<boolean> {
    try {
      return await invoke<boolean>("toggle_shield_https", { enabled });
    } catch (e) {
      console.warn("toggle_shield_https failed:", e);
      return enabled;
    }
  },

  async toggleShieldSandbox(enabled: boolean): Promise<boolean> {
    try {
      return await invoke<boolean>("toggle_shield_sandbox", { enabled });
    } catch (e) {
      console.warn("toggle_shield_sandbox failed:", e);
      return enabled;
    }
  },

  async getTabShieldCount(tabId: string): Promise<number> {
    try {
      return await invoke<number>("get_tab_shield_count", { tabId });
    } catch {
      return 0;
    }
  },

  async getTabShieldBreakdown(tabId: string): Promise<TabBreakdown> {
    try {
      return await invoke<TabBreakdown>("get_tab_shield_breakdown", { tabId });
    } catch {
      return { total: 0, trackers: 0, ads: 0, miners: 0 };
    }
  },

  async checkShieldUrl(url: string, sourceUrl?: string, reqType?: string): Promise<boolean> {
    try {
      return await invoke<boolean>("check_shield_url", { url, sourceUrl, reqType });
    } catch {
      return false;
    }
  },

  async recordShieldBlock(tabId: string, url: string, category?: string): Promise<void> {
    try {
      await invoke("record_shield_block", { tabId, url, category });
    } catch (e) {
      console.warn("record_shield_block failed:", e);
    }
  },

  async onShieldBlocked(callback: (event: ShieldBlockEvent) => void): Promise<UnlistenFn> {
    return listen<ShieldBlockEvent>("shield-blocked-event", (e) => callback(e.payload));
  },

  async onLoadProgress(callback: (event: WebviewLoadProgressEvent) => void): Promise<UnlistenFn> {
    return listen<WebviewLoadProgressEvent>("webview-load-progress", (e) => callback(e.payload));
  },

  // Cache management
  async getCacheInfo(): Promise<CacheInfo> {
    try {
      return await invoke<CacheInfo>("get_cache_info");
    } catch (e) {
      console.warn("get_cache_info failed:", e);
      return { size_bytes: 0, formatted_size: "0 B" };
    }
  },

  async clearBrowserCache(): Promise<CacheInfo> {
    try {
      return await invoke<CacheInfo>("clear_browser_cache");
    } catch (e) {
      console.warn("clear_browser_cache failed:", e);
      return { size_bytes: 0, formatted_size: "0 B" };
    }
  },

  // User Data & Encrypted Vault (AES-256-GCM)
  async getVaultStats(): Promise<VaultStats> {
    try {
      return await invoke<VaultStats>("get_vault_stats");
    } catch (e) {
      console.warn("get_vault_stats failed:", e);
      return {
        is_encrypted: true,
        encryption_algorithm: "AES-256-GCM",
        credentials_count: 0,
        tokens_count: 0,
        storage_dir: "",
        vault_file_bytes: 0,
        cookies_size_bytes: 0,
        cookies_formatted_size: "0 B",
      };
    }
  },

  async listSavedCredentials(): Promise<SavedCredential[]> {
    try {
      return await invoke<SavedCredential[]>("list_saved_credentials");
    } catch (e) {
      console.warn("list_saved_credentials failed:", e);
      return [];
    }
  },

  async saveCredential(
    origin: string,
    username: string,
    password: string,
    title?: string
  ): Promise<SavedCredential> {
    return await invoke<SavedCredential>("save_credential", {
      origin,
      username,
      password,
      title,
    });
  },

  async deleteCredential(id: string): Promise<void> {
    await invoke("delete_credential", { id });
  },

  async listEngineerTokens(): Promise<EngineerToken[]> {
    try {
      return await invoke<EngineerToken[]>("list_engineer_tokens");
    } catch (e) {
      console.warn("list_engineer_tokens failed:", e);
      return [];
    }
  },

  async saveEngineerToken(
    service: string,
    label: string,
    token: string,
    notes?: string
  ): Promise<EngineerToken> {
    return await invoke<EngineerToken>("save_engineer_token", {
      service,
      label,
      token,
      notes,
    });
  },

  async deleteEngineerToken(id: string): Promise<void> {
    await invoke("delete_engineer_token", { id });
  },

  async clearVaultData(): Promise<void> {
    await invoke("clear_vault_data");
  },

  async clearPersistentCookies(): Promise<void> {
    await invoke("clear_persistent_cookies");
  },

  // Downloads
  async getDownloads(): Promise<DownloadItem[]> {
    try {
      return await invoke<DownloadItem[]>("get_downloads");
    } catch (e) {
      console.warn("get_downloads failed:", e);
      return [];
    }
  },

  async clearDownloads(): Promise<void> {
    try {
      await invoke("clear_downloads");
    } catch (e) {
      console.warn("clear_downloads failed:", e);
    }
  },

  async openDownloadFile(id: string): Promise<void> {
    try {
      await invoke("open_download_file", { id });
    } catch (e) {
      console.warn("open_download_file failed:", e);
    }
  },

  async openDownloadDir(path?: string): Promise<void> {
    try {
      await invoke("open_download_dir", { path: path || null });
    } catch (e) {
      console.warn("open_download_dir failed:", e);
    }
  },

  async selectDownloadDir(): Promise<string | null> {
    try {
      return await invoke<string | null>("select_download_dir");
    } catch (e) {
      console.warn("select_download_dir failed:", e);
      return null;
    }
  },

  async cancelDownload(id: string): Promise<void> {
    try {
      await invoke("cancel_download", { id });
    } catch (e) {
      console.warn("cancel_download failed:", e);
    }
  },

  // Overlay Notifications
  async showOverlayNotification(
    title: string,
    message: string,
    notificationType: "info" | "success" | "error" | "download" = "info",
    downloadId?: string
  ): Promise<void> {
    try {
      await invoke("show_overlay_notification", {
        title,
        message,
        notificationType,
        downloadId,
      });
    } catch (e) {
      console.warn("show_overlay_notification failed:", e);
    }
  },

  async hideOverlayNotification(): Promise<void> {
    try {
      await invoke("hide_overlay_notification");
    } catch (e) {
      console.warn("hide_overlay_notification failed:", e);
    }
  },

  async setOverlayRightOffset(offset: number): Promise<void> {
    try {
      await invoke("set_overlay_right_offset", { offset });
    } catch (e) {
      console.warn("set_overlay_right_offset failed:", e);
    }
  },
};
