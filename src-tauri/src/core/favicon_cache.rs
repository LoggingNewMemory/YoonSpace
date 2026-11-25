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

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MAX_HTML_BYTES: usize = 262_144; // 256 KB head scan
const MAX_ICON_BYTES: usize = 524_288; // 512 KB max icon size
const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFaviconMeta {
    pub origin: String,
    pub icon_url: String,
    pub mime_type: String,
    pub title: Option<String>,
    pub cached_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedSiteLogo {
    pub origin: String,
    pub data_url: String,
    pub icon_url: Option<String>,
    pub title: Option<String>,
    pub from_cache: bool,
}

static MEMORY_CACHE: Mutex<Option<HashMap<String, ResolvedSiteLogo>>> = Mutex::new(None);

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn get_favicon_cache_dir() -> PathBuf {
    let mut dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from("/tmp"));
    dir.push("yoonspace");
    dir.push("favicons");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn normalize_site_url(raw: &str) -> Option<url::Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(u) = url::Url::parse(trimmed) {
        if u.scheme() == "http" || u.scheme() == "https" {
            return Some(u);
        }
    }

    let lower = trimmed.to_lowercase();
    let is_local = lower.starts_with("localhost")
        || lower.starts_with("127.")
        || lower.starts_with("0.0.0.0")
        || lower.starts_with("[::1]");
    let scheme = if is_local { "http" } else { "https" };
    url::Url::parse(&format!("{}://{}", scheme, trimmed)).ok()
}

pub fn get_origin_key(raw: &str) -> Option<String> {
    let u = normalize_site_url(raw)?;
    let host = u.host_str()?.to_lowercase();
    match u.port() {
        Some(port) => Some(format!("{}://{}:{}", u.scheme(), host, port)),
        None => Some(format!("{}://{}", u.scheme(), host)),
    }
}

fn hash_origin(origin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(origin.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if i + 1 < input.len() {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < input.len() {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn detect_image_mime(bytes: &[u8], hint_url: &str, content_type: Option<&str>) -> Option<String> {
    if bytes.is_empty() || bytes.len() > MAX_ICON_BYTES {
        return None;
    }

    // Reject obvious HTML/text error responses
    let prefix_len = bytes.len().min(256);
    let prefix_lossy = String::from_utf8_lossy(&bytes[..prefix_len]);
    let trimmed = prefix_lossy.trim_start().to_lowercase();
    if trimmed.starts_with("<!doctype html")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<head")
        || trimmed.starts_with("<body")
    {
        return None;
    }

    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg".to_string());
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif".to_string());
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) || bytes.starts_with(&[0x00, 0x00, 0x02, 0x00]) {
        return Some("image/x-icon".to_string());
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp".to_string());
    }

    // SVG check
    let full_head = String::from_utf8_lossy(&bytes[..bytes.len().min(1024)]).to_lowercase();
    if full_head.contains("<svg") {
        return Some("image/svg+xml".to_string());
    }

    if let Some(ct) = content_type {
        let ct_clean = ct.split(';').next().unwrap_or("").trim().to_lowercase();
        if ct_clean.starts_with("image/") {
            return Some(ct_clean);
        }
    }

    let lower_url = hint_url.to_lowercase();
    if lower_url.ends_with(".ico") {
        return Some("image/x-icon".to_string());
    }

    None
}

fn read_disk_cache(origin: &str) -> Option<ResolvedSiteLogo> {
    let dir = get_favicon_cache_dir();
    let hash = hash_origin(origin);
    let meta_path = dir.join(format!("{}.json", hash));
    let bin_path = dir.join(format!("{}.bin", hash));

    let meta_str = fs::read_to_string(&meta_path).ok()?;
    let meta: CachedFaviconMeta = serde_json::from_str(&meta_str).ok()?;
    let bytes = fs::read(&bin_path).ok()?;
    if bytes.is_empty() {
        return None;
    }

    let data_url = format!("data:{};base64,{}", meta.mime_type, encode_base64(&bytes));
    Some(ResolvedSiteLogo {
        origin: origin.to_string(),
        data_url,
        icon_url: Some(meta.icon_url),
        title: meta.title,
        from_cache: true,
    })
}

fn write_disk_cache(
    origin: &str,
    icon_url: &str,
    mime_type: &str,
    title: Option<String>,
    bytes: &[u8],
) -> Result<ResolvedSiteLogo, String> {
    let dir = get_favicon_cache_dir();
    let hash = hash_origin(origin);
    let meta_path = dir.join(format!("{}.json", hash));
    let bin_path = dir.join(format!("{}.bin", hash));

    fs::write(&bin_path, bytes).map_err(|e| format!("Failed to write favicon cache: {}", e))?;

    let meta = CachedFaviconMeta {
        origin: origin.to_string(),
        icon_url: icon_url.to_string(),
        mime_type: mime_type.to_string(),
        title: title.clone(),
        cached_at: current_timestamp(),
    };
    let meta_json = serde_json::to_string(&meta).map_err(|e| e.to_string())?;
    fs::write(&meta_path, meta_json).map_err(|e| format!("Failed to write favicon meta: {}", e))?;

    let data_url = format!("data:{};base64,{}", mime_type, encode_base64(bytes));
    let resolved = ResolvedSiteLogo {
        origin: origin.to_string(),
        data_url,
        icon_url: Some(icon_url.to_string()),
        title,
        from_cache: false,
    };

    if let Ok(mut guard) = MEMORY_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(origin.to_string(), ResolvedSiteLogo { from_cache: true, ..resolved.clone() });
    }

    Ok(resolved)
}

pub fn get_cached_favicon(raw_url: &str) -> Option<ResolvedSiteLogo> {
    let origin = get_origin_key(raw_url)?;

    if let Ok(mut guard) = MEMORY_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        if let Some(entry) = map.get(&origin) {
            return Some(entry.clone());
        }
    }

    if let Some(disk_entry) = read_disk_cache(&origin) {
        if let Ok(mut guard) = MEMORY_CACHE.lock() {
            let map = guard.get_or_insert_with(HashMap::new);
            map.insert(origin, disk_entry.clone());
        }
        return Some(disk_entry);
    }

    None
}

pub fn clear_favicon_cache() -> Result<(), String> {
    if let Ok(mut guard) = MEMORY_CACHE.lock() {
        if let Some(map) = guard.as_mut() {
            map.clear();
        }
    }
    let dir = get_favicon_cache_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn fetch_bytes_with_curl(url: &str, max_bytes: usize, timeout_secs: u64) -> Option<(Vec<u8>, Option<String>, String)> {
    let marker = "\n__YOON_META__:";
    let timeout_str = timeout_secs.to_string();
    let max_size_str = max_bytes.to_string();

    let output = Command::new("curl")
        .args([
            "-fsSL",
            "--max-time",
            &timeout_str,
            "--connect-timeout",
            "4",
            "--max-redirs",
            "5",
            "--max-filesize",
            &max_size_str,
            "-A",
            BROWSER_USER_AGENT,
            "-w",
            "\n__YOON_META__:%{content_type}|%{url_effective}",
            url,
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = output.stdout;
    let marker_bytes = marker.as_bytes();
    if let Some(pos) = raw.windows(marker_bytes.len()).rposition(|w| w == marker_bytes) {
        let body = raw[..pos].to_vec();
        let meta_str = String::from_utf8_lossy(&raw[pos + marker_bytes.len()..]);
        let mut parts = meta_str.splitn(2, '|');
        let ct = parts.next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
        let final_url = parts
            .next()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| url.to_string());
        Some((body, ct, final_url))
    } else {
        Some((raw, None, url.to_string()))
    }
}

fn parse_attr(tag: &str, attr_name: &str) -> Option<String> {
    let lower = tag.to_lowercase();
    let needle_eq = format!("{}=", attr_name);
    let mut search_from = 0;

    while let Some(idx) = lower[search_from..].find(&needle_eq) {
        let abs_idx = search_from + idx;
        if abs_idx > 0 {
            let prev = lower.as_bytes()[abs_idx - 1];
            if !prev.is_ascii_whitespace() {
                search_from = abs_idx + needle_eq.len();
                continue;
            }
        }
        let val_start = abs_idx + needle_eq.len();
        let rest = &tag[val_start..];
        let trimmed = rest.trim_start();
        if trimmed.is_empty() {
            return None;
        }
        let first = trimmed.as_bytes()[0];
        if first == b'"' || first == b'\'' {
            let quote = first as char;
            let after_quote = &trimmed[1..];
            if let Some(end) = after_quote.find(quote) {
                return Some(decode_html_entities(&after_quote[..end]));
            }
        } else {
            let end = trimmed
                .find(|c: char| c.is_ascii_whitespace() || c == '>')
                .unwrap_or(trimmed.len());
            return Some(decode_html_entities(&trimmed[..end]));
        }
        break;
    }

    None
}

fn decode_html_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .trim()
        .to_string()
}

fn extract_title_and_icons(html: &str, base_url: &url::Url) -> (Option<String>, Vec<String>) {
    let lower = html.to_lowercase();

    // Extract <title>...</title>
    let title = if let Some(t_start) = lower.find("<title") {
        if let Some(gt_rel) = lower[t_start..].find('>') {
            let content_start = t_start + gt_rel + 1;
            if let Some(t_end_rel) = lower[content_start..].find("</title>") {
                let raw_title = &html[content_start..content_start + t_end_rel];
                let clean = decode_html_entities(raw_title)
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                if clean.is_empty() { None } else { Some(clean) }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // Extract <link ...> tags in <head> (or full snippet)
    let mut scored: Vec<(i32, String)> = Vec::new();
    let mut pos = 0;
    while let Some(rel_idx) = lower[pos..].find("<link") {
        let start = pos + rel_idx;
        let Some(gt_rel) = lower[start..].find('>') else {
            break;
        };
        let end = start + gt_rel + 1;
        let tag = &html[start..end];
        pos = end;

        let rel = parse_attr(tag, "rel").unwrap_or_default().to_lowercase();
        let href = match parse_attr(tag, "href") {
            Some(h) if !h.is_empty() => h,
            _ => continue,
        };

        let is_icon = rel.split_whitespace().any(|tok| {
            tok == "icon"
                || tok == "apple-touch-icon"
                || tok == "apple-touch-icon-precomposed"
                || tok == "mask-icon"
        }) || rel == "shortcut icon";

        if !is_icon {
            continue;
        }

        let resolved = if href.starts_with("data:") {
            href.clone()
        } else if let Ok(joined) = base_url.join(&href) {
            joined.to_string()
        } else {
            continue;
        };

        let mut score = 10;
        let href_lower = resolved.to_lowercase();
        let type_attr = parse_attr(tag, "type").unwrap_or_default().to_lowercase();
        let sizes_attr = parse_attr(tag, "sizes").unwrap_or_default().to_lowercase();

        if href_lower.contains(".svg") || type_attr.contains("svg") {
            score += 60;
        } else if href_lower.contains(".png") || type_attr.contains("png") {
            score += 40;
        }
        if rel.contains("apple-touch-icon") {
            score += 35;
        }
        if rel.split_whitespace().any(|t| t == "icon") {
            score += 25;
        }
        if rel.contains("mask-icon") {
            score -= 20;
        }
        if let Some(dim_str) = sizes_attr.split('x').next() {
            if let Ok(dim) = dim_str.trim().parse::<i32>() {
                score += dim.min(128) / 2;
            }
        }

        scored.push((score, resolved));
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let mut urls = Vec::new();
    for (_, u) in scored {
        if !urls.contains(&u) {
            urls.push(u);
        }
    }

    (title, urls)
}

fn try_decode_data_url(data_url: &str) -> Option<(Vec<u8>, String)> {
    if !data_url.starts_with("data:image/") {
        return None;
    }
    let comma = data_url.find(',')?;
    let header = &data_url[5..comma];
    let payload = &data_url[comma + 1..];
    if header.ends_with(";base64") {
        // Basic validation: return None so we don't store unverified base64 without decoding,
        // or store directly if small SVG/PNG. Actually we can store as-is if valid length.
        let mime = header.trim_end_matches(";base64").to_string();
        if payload.len() <= MAX_ICON_BYTES * 2 {
            return Some((Vec::new(), mime));
        }
    }
    None
}

fn try_download_and_cache(
    origin: &str,
    icon_url: &str,
    title: Option<String>,
) -> Option<ResolvedSiteLogo> {
    if icon_url.starts_with("data:image/") {
        if let Some((_, _mime)) = try_decode_data_url(icon_url) {
            return Some(ResolvedSiteLogo {
                origin: origin.to_string(),
                data_url: icon_url.to_string(),
                icon_url: Some(icon_url.to_string()),
                title,
                from_cache: false,
            });
        }
        return None;
    }

    let (bytes, ct, final_icon_url) = fetch_bytes_with_curl(icon_url, MAX_ICON_BYTES, 5)?;
    let mime = detect_image_mime(&bytes, &final_icon_url, ct.as_deref())?;
    write_disk_cache(origin, &final_icon_url, &mime, title, &bytes).ok()
}

fn is_local_host(host: &str) -> bool {
    let h = host.to_lowercase();
    h == "localhost" || h.starts_with("127.") || h == "0.0.0.0" || h == "::1" || h == "[::1]"
}

/// Detects and caches a site's logo (and optionally title).
/// Serves directly from memory/disk cache if already cached unless `force_refresh` is true.
pub fn resolve_site_logo(
    raw_url: &str,
    candidate_icon_url: Option<&str>,
    known_title: Option<&str>,
    force_refresh: bool,
) -> Result<ResolvedSiteLogo, String> {
    let parsed_url = normalize_site_url(raw_url).ok_or_else(|| "Invalid URL".to_string())?;
    let origin = get_origin_key(parsed_url.as_str()).ok_or_else(|| "Invalid URL origin".to_string())?;

    if !force_refresh {
        if let Some(mut cached) = get_cached_favicon(&origin) {
            if cached.title.is_none() {
                if let Some(t) = known_title {
                    cached.title = Some(t.to_string());
                }
            }
            return Ok(cached);
        }
    }

    let mut detected_title = known_title
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    // 1. If caller (e.g. live WebView DOM) already found a candidate icon URL, try it first!
    if let Some(cand) = candidate_icon_url.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if let Some(res) = try_download_and_cache(&origin, cand, detected_title.clone()) {
            return Ok(res);
        }
    }

    // 2. Fetch HTML head to detect <link rel="icon"> and <title>
    let mut icon_candidates: Vec<String> = Vec::new();
    if let Some((html_bytes, ct, final_url_str)) = fetch_bytes_with_curl(parsed_url.as_str(), MAX_HTML_BYTES, 6) {
        let is_html = ct
            .as_deref()
            .map(|c| c.to_lowercase().contains("html") || c.to_lowercase().contains("xml"))
            .unwrap_or(true);
        if is_html && !html_bytes.is_empty() {
            let html_str = String::from_utf8_lossy(&html_bytes);
            let base = url::Url::parse(&final_url_str).unwrap_or_else(|_| parsed_url.clone());
            let (html_title, parsed_icons) = extract_title_and_icons(&html_str, &base);
            if detected_title.is_none() {
                detected_title = html_title;
            }
            icon_candidates.extend(parsed_icons);
        }
    }

    // 3. Common well-known paths on the origin
    let origin_base = url::Url::parse(&origin).unwrap_or_else(|_| parsed_url.clone());
    for fallback_path in ["/favicon.svg", "/favicon.png", "/favicon.ico", "/apple-touch-icon.png"] {
        if let Ok(u) = origin_base.join(fallback_path) {
            let s = u.to_string();
            if !icon_candidates.contains(&s) {
                icon_candidates.push(s);
            }
        }
    }

    // 4. Try each candidate in priority order
    for cand in &icon_candidates {
        if let Some(res) = try_download_and_cache(&origin, cand, detected_title.clone()) {
            return Ok(res);
        }
    }

    // 5. Fallback to Google S2 favicon service for public domains if direct detection failed
    if let Some(host) = parsed_url.host_str() {
        if !is_local_host(host) {
            let s2_url = format!(
                "https://www.google.com/s2/favicons?domain={}&sz=64",
                host
            );
            if let Some(res) = try_download_and_cache(&origin, &s2_url, detected_title.clone()) {
                return Ok(res);
            }
        }
    }

    // No icon found, return empty data_url with detected title if any
    Ok(ResolvedSiteLogo {
        origin,
        data_url: String::new(),
        icon_url: None,
        title: detected_title,
        from_cache: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_origin_and_url_normalization() {
        assert_eq!(
            get_origin_key("github.com/rust-lang/rust").as_deref(),
            Some("https://github.com")
        );
        assert_eq!(
            get_origin_key("localhost:3000/app").as_deref(),
            Some("http://localhost:3000")
        );
        assert_eq!(
            get_origin_key("https://WWW.Example.COM:8443/path").as_deref(),
            Some("https://www.example.com:8443")
        );
    }

    #[test]
    fn test_extract_title_and_icons_ranking() {
        let html = r#"
            <html>
              <head>
                <title>  YoonSpace   Docs  </title>
                <link rel="shortcut icon" href="/favicon.ico">
                <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
                <link rel="icon" type="image/svg+xml" href="/logo.svg">
              </head>
            </html>
        "#;
        let base = url::Url::parse("https://example.com/docs/intro").unwrap();
        let (title, icons) = extract_title_and_icons(html, &base);
        assert_eq!(title.as_deref(), Some("YoonSpace Docs"));
        assert_eq!(icons.first().map(|s| s.as_str()), Some("https://example.com/logo.svg"));
        assert!(icons.contains(&"https://example.com/icon-32.png".to_string()));
        assert!(icons.contains(&"https://example.com/favicon.ico".to_string()));
    }

    #[test]
    fn test_detect_image_mime_and_reject_html() {
        let png_sig = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00];
        assert_eq!(
            detect_image_mime(&png_sig, "https://example.com/icon", None).as_deref(),
            Some("image/png")
        );

        let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>";
        assert_eq!(
            detect_image_mime(svg, "https://example.com/logo.svg", None).as_deref(),
            Some("image/svg+xml")
        );

        let html_404 = b"<!DOCTYPE html><html><body>404 Not Found</body></html>";
        assert_eq!(
            detect_image_mime(html_404, "https://example.com/favicon.ico", Some("text/html")),
            None
        );
    }

    #[test]
    fn test_cache_round_trip() {
        let origin = "https://cache-unit-test.yoonspace.local";
        let png_bytes = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];
        let written = write_disk_cache(
            origin,
            "https://cache-unit-test.yoonspace.local/logo.png",
            "image/png",
            Some("Test Site".to_string()),
            &png_bytes,
        )
        .expect("should write cache");
        assert!(!written.from_cache);
        assert!(written.data_url.starts_with("data:image/png;base64,"));

        let cached = get_cached_favicon("https://cache-unit-test.yoonspace.local/subpage")
            .expect("should read from cache");
        assert!(cached.from_cache);
        assert_eq!(cached.data_url, written.data_url);
        assert_eq!(cached.title.as_deref(), Some("Test Site"));
    }
}
