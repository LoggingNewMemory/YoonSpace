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

use std::sync::Mutex;
use super::engine::get_shield_manager;
use super::scriptlets::get_shield_injection_script;
use super::types::ShieldCategory;

static TEST_MUTEX: Mutex<()> = Mutex::new(());

#[test]
fn test_shield_manager_from_cloned_brave() {
    let _guard = TEST_MUTEX.lock().unwrap();
    let manager = get_shield_manager();
    manager.set_enabled(true);
    manager.set_block_trackers(true);
    assert!(manager.is_enabled());

    // Check blocking of ad network URLs with adblock-rust native engine
    assert!(manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));
    assert!(manager.check_url("https://www.youtube.com/pagead/parallel_ad_playback", "https://www.youtube.com/watch?v=test", "xmlhttprequest"));
    assert!(manager.check_url("https://www.youtube.com/api/stats/ads?adformat=1", "https://www.youtube.com/watch?v=test", "other"));
    assert!(manager.check_url("https://www.youtube.com/youtubei/v1/player/ad_break", "https://www.youtube.com/watch?v=test", "fetch"));

    // YouTube video stream & metadata should NOT be blocked
    assert!(!manager.check_url("https://www.youtube.com/youtubei/v1/player?key=test", "https://www.youtube.com/watch?v=test", "fetch"));

    // Check non-ad URL passes through
    assert!(!manager.check_url("https://www.google.com/search?q=rust", "https://www.google.com", "document"));

    // Verify Brave scriptlets & cosmetic hide selectors exist for YouTube
    assert!(!manager.get_youtube_scriptlet().is_empty());
    assert!(!manager.get_youtube_hide_selectors().is_empty());

    // Verify category classifications directly via adblock-rust
    assert_eq!(manager.classify_url("https://coin-hive.com/lib/coinhive.min.js", "script"), ShieldCategory::Miner);
    assert_eq!(manager.classify_url("https://google-analytics.com/analytics.js", "script"), ShieldCategory::Tracker);
    assert_eq!(manager.classify_url("https://googleads.g.doubleclick.net/pagead/ads", "script"), ShieldCategory::Ad);
}

#[test]
fn test_clean_shield_injection_script() {
    let script = get_shield_injection_script("test_tab");
    assert!(script.contains("window.__YOONSPACE_SHIELD_INSTALLED__"));
    assert!(script.contains("TAB_ID = \"test_tab\""));

    // Ensure no watchdog loop or hijack of playback controls exists
    assert!(!script.contains("runYouTubeWatchdog"));
    assert!(!script.contains("setInterval(runYouTubeWatchdog"));
    assert!(!script.contains("video.play()"));

    // Ensure Brave's scriptlets for YouTube are injected
    assert!(script.contains("ytInitialPlayerResponse") || script.contains("trustedReplaceXhrResponse") || script.contains("trustedReplaceFetchResponse"));

    // Ensure navigation keyboard shortcuts (Back, Forward, Reload) are present
    assert!(script.contains("window.history.back()"));
    assert!(script.contains("window.history.forward()"));
    assert!(script.contains("window.location.reload()"));
}

#[test]
fn test_shield_breakdown_and_split_views() {
    let _guard = TEST_MUTEX.lock().unwrap();
    let manager = get_shield_manager();
    manager.reset_tab("test_split_tab");

    // Record blocks across main tab and split panes
    manager.record_block("test_split_tab_left", "https://googleads.g.doubleclick.net/pagead/ads", Some(ShieldCategory::Ad));
    manager.record_block("test_split_tab_left", "https://google-analytics.com/analytics.js", Some(ShieldCategory::Tracker));
    manager.record_block("test_split_tab_right", "https://coin-hive.com/lib/coinhive.min.js", Some(ShieldCategory::Miner));
    manager.record_block("test_split_tab", "https://facebook.net/tr?id=123", Some(ShieldCategory::Tracker));

    let breakdown = manager.get_tab_breakdown("test_split_tab");
    assert_eq!(breakdown.total, 4);
    assert_eq!(breakdown.ads, 1);
    assert_eq!(breakdown.trackers, 2);
    assert_eq!(breakdown.miners, 1);
    assert_eq!(manager.get_tab_count("test_split_tab"), 4);

    // Test batch cosmetic element counting
    let (batch_breakdown, _) = manager.record_blocks("test_split_tab_left", "cosmetic://example.com/ads", Some(ShieldCategory::Ad), 5);
    assert_eq!(batch_breakdown.ads, 6);
    assert_eq!(batch_breakdown.total, 9);
    assert_eq!(manager.get_tab_count("test_split_tab"), 9);

    manager.reset_tab("test_split_tab");
    assert_eq!(manager.get_tab_count("test_split_tab"), 0);

    // Test independent pane reset in split view
    manager.record_block("test_split_tab_left", "https://googleads.g.doubleclick.net/pagead/ads", Some(ShieldCategory::Ad));
    manager.record_block("test_split_tab_right", "https://coin-hive.com/lib/coinhive.min.js", Some(ShieldCategory::Miner));
    assert_eq!(manager.get_tab_count("test_split_tab"), 2);

    // Resetting only left pane retains right pane's count
    let (root, rem) = manager.reset_tab("test_split_tab_left");
    assert_eq!(root, "test_split_tab");
    assert_eq!(rem.total, 1);
    assert_eq!(rem.miners, 1);
    assert_eq!(rem.ads, 0);
    assert_eq!(manager.get_tab_count("test_split_tab"), 1);

    manager.reset_tab("test_split_tab");
    assert_eq!(manager.get_tab_count("test_split_tab"), 0);
}

#[test]
fn test_shield_toggles_and_trackers() {
    let _guard = TEST_MUTEX.lock().unwrap();
    let manager = get_shield_manager();

    // Master toggle behavior
    manager.set_enabled(false);
    assert!(!manager.is_enabled());
    assert!(!manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));
    manager.set_enabled(true);
    assert!(manager.is_enabled());
    assert!(manager.check_url("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123", "https://example.com", "script"));

    // Tracker toggle behavior
    manager.set_block_trackers(false);
    assert!(!manager.is_block_trackers());
    assert!(!manager.check_url("https://google-analytics.com/analytics.js", "https://example.com", "script"));

    manager.set_block_trackers(true);
    assert!(manager.is_block_trackers());
    assert!(manager.check_url("https://google-analytics.com/analytics.js", "https://example.com", "script"));

    // HTTPS toggle
    manager.set_upgrade_https(true);
    assert!(manager.is_upgrade_https());

    // Sandboxing toggle
    manager.set_aggressive_sandbox(true);
    assert!(manager.is_aggressive_sandbox());
    manager.set_aggressive_sandbox(false);
    assert!(!manager.is_aggressive_sandbox());
}
