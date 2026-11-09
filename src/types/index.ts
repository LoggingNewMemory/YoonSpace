export interface MemoryStats {
  resident_mb: number;
  virtual_mb: number;
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
