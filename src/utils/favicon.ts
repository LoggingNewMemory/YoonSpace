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
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = "https://" + urlStr;
    }
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

export function getFaviconUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  const domain = getDomain(rawUrl);
  if (!domain || domain === "localhost" || domain.startsWith("127.0.0.1")) {
    return "";
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export function getFallbackIcon(rawUrl?: string, title?: string): string {
  const domain = getDomain(rawUrl).toLowerCase();
  const lowerTitle = (title || "").toLowerCase();

  if (domain.includes("github") || lowerTitle.includes("github")) return "code";
  if (domain.includes("youtube") || lowerTitle.includes("youtube")) return "play_circle";
  if (domain.includes("jira") || domain.includes("atlassian")) return "troubleshoot";
  if (
    domain.includes("claude") ||
    domain.includes("openai") ||
    domain.includes("chatgpt") ||
    domain.includes("gemini")
  ) {
    return "smart_toy";
  }
  if (domain.includes("google") || lowerTitle.includes("search")) return "search";
  if (domain.includes("stack") || domain.includes("reddit")) return "forum";
  if (domain.includes("localhost") || domain.startsWith("127.0.0.1")) return "terminal";
  return "language";
}
