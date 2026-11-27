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

import type { BookmarkItem, MinimizedTab } from "../types";

export type AutocompleteKind = "history" | "bookmark" | "tab" | "search";

export interface SearchHistoryEntry {
  value: string;
  url: string;
  title?: string;
  kind: "search" | "url";
  count: number;
  lastUsed: number;
}

export interface AutocompleteItem {
  id: string;
  value: string;
  title: string;
  subtitle?: string;
  kind: AutocompleteKind;
  tabId?: string;
  score: number;
}

const HISTORY_STORAGE_KEY = "yoonspace_search_history_v1";
const MAX_HISTORY_ENTRIES = 200;

let cachedHistory: SearchHistoryEntry[] | null = null;

function loadHistory(): SearchHistoryEntry[] {
  if (cachedHistory) return cachedHistory;
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      cachedHistory = [];
      return cachedHistory;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedHistory = [];
      return cachedHistory;
    }
    cachedHistory = parsed.filter(
      (item): item is SearchHistoryEntry =>
        Boolean(item && typeof item.value === "string" && typeof item.url === "string")
    );
    return cachedHistory;
  } catch {
    cachedHistory = [];
    return cachedHistory;
  }
}

function saveHistory(entries: SearchHistoryEntry[]): void {
  cachedHistory = entries;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

export function isLikelyUrlInput(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) return true;
  if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)(:\d+)?(\/.*)?$/i.test(trimmed)) return true;
  return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(trimmed);
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
}

export function recordSearchHistory(rawInput: string, resolvedUrl: string, title?: string): void {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed.length > 500) return;

  const isUrl = isLikelyUrlInput(trimmed);
  const canonicalValue = isUrl ? stripProtocol(resolvedUrl || trimmed) : trimmed;
  const key = canonicalValue.toLowerCase();
  const now = Date.now();

  const entries = [...loadHistory()];
  const existingIdx = entries.findIndex(
    (e) => e.value.toLowerCase() === key || e.url.toLowerCase() === resolvedUrl.toLowerCase()
  );

  if (existingIdx >= 0) {
    const existing = entries[existingIdx];
    entries.splice(existingIdx, 1);
    entries.unshift({
      value: canonicalValue,
      url: resolvedUrl || existing.url,
      title: title?.trim() || existing.title,
      kind: isUrl ? "url" : existing.kind,
      count: existing.count + 1,
      lastUsed: now,
    });
  } else {
    entries.unshift({
      value: canonicalValue,
      url: resolvedUrl,
      title: title?.trim() || undefined,
      kind: isUrl ? "url" : "search",
      count: 1,
      lastUsed: now,
    });
  }

  if (entries.length > MAX_HISTORY_ENTRIES) {
    entries.sort((a, b) => b.lastUsed - a.lastUsed);
    entries.length = MAX_HISTORY_ENTRIES;
  }

  saveHistory(entries);
}

export function removeSearchHistory(value: string): void {
  const key = value.trim().toLowerCase();
  const filtered = loadHistory().filter((e) => e.value.toLowerCase() !== key);
  saveHistory(filtered);
}

function computeFrecency(count: number, lastUsed: number): number {
  const ageHours = Math.max(0, (Date.now() - lastUsed) / 3_600_000);
  const recencyBoost = 100 / (1 + ageHours / 24);
  return Math.min(80, count * 12) + recencyBoost;
}

function matchScore(queryLower: string, target: string, baseBoost: number): number {
  if (!queryLower) return baseBoost;
  const lower = target.toLowerCase();
  if (lower === queryLower) return baseBoost + 500;
  if (lower.startsWith(queryLower)) return baseBoost + 320;
  const wordBoundaryIdx = lower.indexOf(` ${queryLower}`);
  if (wordBoundaryIdx >= 0) return baseBoost + 210;
  const subIdx = lower.indexOf(queryLower);
  if (subIdx >= 0) return baseBoost + Math.max(40, 160 - subIdx * 2);
  return -1;
}

export function getLocalSuggestions(
  rawQuery: string,
  bookmarks: BookmarkItem[],
  tabs: MinimizedTab[],
  maxResults = 8
): AutocompleteItem[] {
  const q = rawQuery.trim().toLowerCase();
  const seen = new Set<string>();
  const candidates: AutocompleteItem[] = [];

  // 1. Open / Minimized tabs
  for (const tab of tabs) {
    const url = tab.url || tab.leftUrl || "";
    const title = tab.title || url;
    const displayUrl = url ? stripProtocol(url) : title;
    const s1 = matchScore(q, displayUrl, 220);
    const s2 = matchScore(q, title, 200);
    const best = Math.max(s1, s2);
    if (best > 0) {
      const dedupeKey = (url || title).toLowerCase();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        candidates.push({
          id: `tab:${tab.id}`,
          value: url || title,
          title,
          subtitle: url ? displayUrl : "Open tab",
          kind: "tab",
          tabId: tab.id,
          score: best,
        });
      }
    }
  }

  // 2. Bookmarks
  for (const bm of bookmarks) {
    const displayUrl = stripProtocol(bm.url);
    const s1 = matchScore(q, displayUrl, 190);
    const s2 = matchScore(q, bm.title, 185);
    const best = Math.max(s1, s2);
    if (best > 0) {
      const dedupeKey = bm.url.toLowerCase();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        candidates.push({
          id: `bm:${bm.id}`,
          value: bm.url,
          title: bm.title || displayUrl,
          subtitle: displayUrl,
          kind: "bookmark",
          score: best,
        });
      }
    }
  }

  // 3. Past searches & visited URLs
  for (const entry of loadHistory()) {
    const frecency = computeFrecency(entry.count, entry.lastUsed);
    const s1 = matchScore(q, entry.value, 120 + frecency);
    const s2 = entry.title ? matchScore(q, entry.title, 100 + frecency) : -1;
    const best = Math.max(s1, s2);
    if (best > 0) {
      const dedupeKey = entry.value.toLowerCase();
      if (!seen.has(dedupeKey) && !seen.has(entry.url.toLowerCase())) {
        seen.add(dedupeKey);
        candidates.push({
          id: `hist:${entry.value}`,
          value: entry.kind === "url" ? entry.value : entry.value,
          title: entry.value,
          subtitle: entry.kind === "url" ? entry.title || entry.url : undefined,
          kind: "history",
          score: best,
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxResults);
}

export function getInlineCompletion(
  rawQuery: string,
  items: AutocompleteItem[]
): string | null {
  if (!rawQuery || rawQuery.length < 2) return null;
  const qLower = rawQuery.toLowerCase();
  for (const item of items) {
    if (item.kind === "search") continue;
    const candidate = item.kind === "bookmark" || item.kind === "tab"
      ? stripProtocol(item.value)
      : item.value;
    if (
      candidate.toLowerCase().startsWith(qLower) &&
      candidate.length > rawQuery.length
    ) {
      return candidate;
    }
  }
  return null;
}
