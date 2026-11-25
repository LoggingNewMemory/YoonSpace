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

import { tauriIpc } from "../services/tauri_ipc";
import type { BookmarkItem } from "../types";

const faviconDataCache = new Map<string, string>();
const pendingFaviconRequests = new Map<string, Promise<string>>();
const faviconListeners = new Set<(origin: string, dataUrl: string) => void>();

export function normalizeUrlForCache(rawUrl?: string): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  const isLocal =
    lower.startsWith("localhost") ||
    lower.startsWith("127.") ||
    lower.startsWith("0.0.0.0") ||
    lower.startsWith("[::1]");
  return `${isLocal ? "http" : "https"}://${trimmed}`;
}

export function getOriginKey(rawUrl?: string): string {
  const urlStr = normalizeUrlForCache(rawUrl);
  if (!urlStr) return "";
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `${u.protocol}//${u.host.toLowerCase()}`;
  } catch {
    return "";
  }
}

export function getDomain(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    const urlStr = normalizeUrlForCache(rawUrl);
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\d*\./i, "").toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

// Detects whether a domain or host is local development.
export function isLocalHost(domainOrUrl?: string): boolean {
  if (!domainOrUrl) return false;
  const host = getDomain(domainOrUrl);
  return host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host === "::1";
}

export function getCachedFaviconSync(rawUrl?: string): string {
  const origin = getOriginKey(rawUrl);
  if (!origin) return "";
  return faviconDataCache.get(origin) || "";
}

export function setCachedFaviconDataUrl(rawUrl: string, dataUrl: string): void {
  const origin = getOriginKey(rawUrl);
  if (!origin || !dataUrl) return;
  const prev = faviconDataCache.get(origin);
  faviconDataCache.set(origin, dataUrl);
  if (prev !== dataUrl) {
    faviconListeners.forEach((cb) => cb(origin, dataUrl));
  }
}

export function primeFaviconCacheFromBookmarks(bookmarks: BookmarkItem[]): void {
  for (const bm of bookmarks) {
    if (bm.url && bm.icon_data_url) {
      const origin = getOriginKey(bm.url);
      if (origin && !faviconDataCache.has(origin)) {
        faviconDataCache.set(origin, bm.icon_data_url);
      }
    }
  }
}

export function onFaviconCached(cb: (origin: string, dataUrl: string) => void): () => void {
  faviconListeners.add(cb);
  return () => {
    faviconListeners.delete(cb);
  };
}

export async function resolveAndCacheFavicon(
  rawUrl?: string,
  candidateIconUrl?: string,
  title?: string,
  forceRefresh = false
): Promise<string> {
  const origin = getOriginKey(rawUrl);
  if (!origin || !rawUrl) return "";

  if (!forceRefresh) {
    const inMemory = faviconDataCache.get(origin);
    if (inMemory) return inMemory;

    const existingPromise = pendingFaviconRequests.get(origin);
    if (existingPromise) return existingPromise;
  }

  const task = (async () => {
    try {
      if (!forceRefresh) {
        const diskCached = await tauriIpc.getCachedFavicon(rawUrl);
        if (diskCached?.data_url) {
          setCachedFaviconDataUrl(rawUrl, diskCached.data_url);
          return diskCached.data_url;
        }
      }

      const resolved = await tauriIpc.resolveSiteLogo(
        rawUrl,
        candidateIconUrl,
        title,
        forceRefresh
      );
      if (resolved?.data_url) {
        setCachedFaviconDataUrl(rawUrl, resolved.data_url);
        return resolved.data_url;
      }
      return "";
    } finally {
      pendingFaviconRequests.delete(origin);
    }
  })();

  pendingFaviconRequests.set(origin, task);
  return task;
}

export function getFaviconUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  const cached = getCachedFaviconSync(rawUrl);
  if (cached) return cached;

  // Trigger background detection & persistent caching once
  void resolveAndCacheFavicon(rawUrl);

  try {
    const urlStr = normalizeUrlForCache(rawUrl);
    const u = new URL(urlStr);
    if (isLocalHost(u.hostname)) {
      return `${u.origin}/favicon.ico`;
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
  } catch {
    return "";
  }
}

export function getFallbackIcon(rawUrl?: string, _title?: string): string {
  if (isLocalHost(rawUrl)) {
    return "terminal";
  }
  return "language";
}
