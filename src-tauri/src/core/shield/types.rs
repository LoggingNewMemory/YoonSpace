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
use serde::{Deserialize, Serialize};
use crate::core::config::ShieldSettings;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShieldCategory {
    Tracker,
    Ad,
    Miner,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TabBreakdown {
    pub total: u64,
    pub trackers: u64,
    pub ads: u64,
    pub miners: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShieldStats {
    pub enabled: bool,
    pub block_trackers: bool,
    pub upgrade_https: bool,
    pub aggressive_sandbox: bool,
    pub total_blocked: u64,
    pub total_breakdown: TabBreakdown,
    pub tab_blocked: HashMap<String, u64>,
    pub tab_breakdown: HashMap<String, TabBreakdown>,
    pub recent_blocked: Vec<BlockedItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedItem {
    pub url: String,
    pub domain: String,
    pub category: String,
    pub filter: String,
    pub timestamp: u64,
}

pub struct ShieldState {
    pub settings: ShieldSettings,
    pub total_blocked: u64,
    pub total_breakdown: TabBreakdown,
    pub tab_blocked: HashMap<String, u64>,
    pub tab_breakdown: HashMap<String, TabBreakdown>,
    pub recent_blocked: Vec<BlockedItem>,
}

#[derive(Debug, Clone, Copy)]
pub struct SourceIndices {
    pub tracker_idx: u32,
    pub miner_idx: u32,
    pub ad_idx: u32,
}
