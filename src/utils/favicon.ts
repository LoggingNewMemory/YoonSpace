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

export function getDomain(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    let urlStr = rawUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
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

export function getFaviconUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  try {
    let urlStr = rawUrl.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
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
