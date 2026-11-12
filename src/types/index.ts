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

export interface AppConfig {
  active_search_engine: string;
  search_engines: SearchEngine[];
  split_presets: SplitPreset[];
}

export interface SplitBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
}
