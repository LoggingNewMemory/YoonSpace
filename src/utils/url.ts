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

import type { MinimizedTab, SearchEngine } from "../types";

export function normalizeUrl(
  input: string,
  searchEngines: SearchEngine[],
  activeEngineId: string
): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://google.com";

  // If already starts with a protocol scheme (http://, https://, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // Detect domain names (with or without subdomains, e.g. youtube.com, www.youtube.com), localhost, or IPv4
  const isDomainOrHost =
    !/\s/.test(trimmed) &&
    ((/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^localhost(:\d+)?(\/.*)?$/i.test(trimmed) ||
      /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmed)));

  if (isDomainOrHost) {
    return `https://${trimmed}`;
  }

  const engine =
    searchEngines.find((e) => e.id === activeEngineId) ||
    searchEngines[0] || {
      query_url: "https://www.google.com/search?q=",
    };
  return `${engine.query_url}${encodeURIComponent(trimmed)}`;
}

export function deriveTitleFromInput(input: string): string {
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

export function getTabEffectiveUrl(
  tab: MinimizedTab,
  preferPane: "left" | "right" = "left"
): string {
  if (tab.isSplit) {
    if (preferPane === "right") {
      return tab.rightUrl || tab.leftUrl || tab.url || "https://google.com";
    }
    return tab.leftUrl || tab.rightUrl || tab.url || "https://google.com";
  }
  return tab.url || tab.leftUrl || tab.rightUrl || "https://google.com";
}

export function getTabEffectiveTitle(
  tab: MinimizedTab,
  preferPane: "left" | "right" = "left"
): string {
  if (tab.isSplit) {
    if (preferPane === "right") {
      return tab.rightTitle || tab.leftTitle || tab.title || "Web View";
    }
    return tab.leftTitle || tab.rightTitle || tab.title || "Web View";
  }
  return tab.title || tab.leftTitle || tab.rightTitle || "Web View";
}
