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

export interface MemoryStats {
  resident_mb: number;   // Private Anonymous Memory (RssAnon)
  total_rss_mb: number;  // Total VmRSS (including shared system libs)
  shared_mb: number;     // Shared library pages
  virtual_mb: number;    // Virtual address space
  gpu_renderer?: string; // Active GPU render node/device
}

export interface SearchEngine {
  id: string;
  name: string;
  query_url: string;
  icon: string;
}

export interface SplitPreset {
  id: string;
  title: string;
  icon: string;
  left_url: string;
  right_url: string;
}

export interface DownloadSettings {
  download_dir: string;
  ask_where_to_save: boolean;
  open_folder_on_complete: boolean;
}

export type WallpaperOrder = "a_z" | "z_a" | "randomized";

export interface WallpaperSettings {
  folder_path: string;
  transparency: number;
  order?: WallpaperOrder;
}

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  destination: string;
  total_bytes: number;
  received_bytes: number;
  progress: number;
  state: "downloading" | "completed" | "failed" | "cancelled";
  created_at: number;
  error?: string;
}

export interface AppConfig {
  active_search_engine: string;
  search_engines: SearchEngine[];
  split_presets: SplitPreset[];
  shield_settings?: ShieldSettings;
  download_settings?: DownloadSettings;
  wallpaper_settings?: WallpaperSettings;
  media_volume?: number;
}

export interface SplitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  split_ratio?: number;
}

export interface SplitRatioChangedEvent {
  tab_id: string;
  ratio: number;
  left_width: number;
  right_width: number;
}

export interface ShieldSettings {
  enabled: boolean;
  block_trackers: boolean;
  upgrade_https: boolean;
  aggressive_sandbox: boolean;
}

export interface TabBreakdown {
  total: number;
  trackers: number;
  ads: number;
  miners: number;
}

export interface BlockedItem {
  url: string;
  domain: string;
  category: string;
  filter: string;
  timestamp: number;
}

export interface ShieldStats {
  enabled: boolean;
  block_trackers: boolean;
  upgrade_https: boolean;
  aggressive_sandbox: boolean;
  total_blocked: number;
  total_breakdown: TabBreakdown;
  tab_blocked: Record<string, number>;
  tab_breakdown: Record<string, TabBreakdown>;
  recent_blocked: BlockedItem[];
}

export interface ShieldBlockEvent {
  tab_id: string;
  url: string;
  category: string;
  tab_count: number;
  total_count: number;
  tab_breakdown: TabBreakdown;
}

export interface WebviewLoadProgressEvent {
  tab_id: string;
  progress: number;
  status: "started" | "progress" | "finished" | "failed";
}

export interface MinimizedTab {
  id: string;
  title: string;
  url: string;
  query?: string;
  isSplit?: boolean;
  leftUrl?: string;
  rightUrl?: string;
  leftTitle?: string;
  rightTitle?: string;
  icon?: string;
  leftIcon?: string;
  rightIcon?: string;
  splitRatio?: number;
}

export interface StorageCategoryInfo {
  id: string;
  label: string;
  description: string;
  size_bytes: number;
  formatted_size: string;
  file_count: number;
  path: string;
  clearable: boolean;
}

export interface CacheInfo {
  size_bytes: number;
  formatted_size: string;
  http_cache_bytes: number;
  http_cache_formatted: string;
  site_data_bytes: number;
  site_data_formatted: string;
  favicon_cache_bytes: number;
  favicon_cache_formatted: string;
  shield_cache_bytes: number;
  shield_cache_formatted: string;
  cache_dir: string;
  cache_limit_mb: number;
  categories: StorageCategoryInfo[];
}

export type CacheClearScope = "http_cache" | "site_data" | "favicons" | "all";

export interface SavedCredential {
  id: string;
  origin: string;
  username: string;
  password: string;
  title?: string;
  created_at: number;
  updated_at: number;
}

export interface EngineerToken {
  id: string;
  service: string;
  label: string;
  token: string;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface VaultStats {
  is_encrypted: boolean;
  encryption_algorithm: string;
  credentials_count: number;
  tokens_count: number;
  storage_dir: string;
  vault_file_bytes: number;
  cookies_size_bytes: number;
  cookies_formatted_size: string;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  icon_url?: string;
  icon_data_url?: string;
  created_at: number;
  updated_at: number;
}

export interface ResolvedSiteLogo {
  origin: string;
  data_url: string;
  icon_url?: string;
  title?: string;
  from_cache: boolean;
}

export interface FaviconCachedEvent {
  tab_id: string;
  url: string;
  origin: string;
  data_url: string;
  icon_url?: string;
  title?: string;
  from_cache: boolean;
}
