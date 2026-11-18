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

use serde::{Deserialize, Serialize};

pub const MIN_SPLIT_RATIO: f64 = 0.30;
pub const MAX_SPLIT_RATIO: f64 = 0.70;

static SPLIT_RATIOS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, f64>>> =
    std::sync::OnceLock::new();

fn get_split_ratios_map() -> &'static std::sync::Mutex<std::collections::HashMap<String, f64>> {
    SPLIT_RATIOS.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

pub fn get_tab_split_ratio(tab_id: &str) -> f64 {
    let map = get_split_ratios_map().lock().unwrap();
    map.get(tab_id).copied().unwrap_or(0.5)
}

pub fn set_tab_split_ratio(tab_id: &str, ratio: f64) {
    let mut map = get_split_ratios_map().lock().unwrap();
    map.insert(
        tab_id.to_string(),
        ratio.clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO),
    );
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SplitViewRequest {
    pub tab_id: Option<String>,
    pub left_url: String,
    pub right_url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleViewRequest {
    pub tab_id: Option<String>,
    pub url: String,
    pub bounds: SplitBounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SplitBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub split_ratio: Option<f64>,
}

impl SplitBounds {
    pub fn split_ratio(&self) -> f64 {
        self.split_ratio
            .unwrap_or(0.5)
            .clamp(MIN_SPLIT_RATIO, MAX_SPLIT_RATIO)
    }

    pub fn left_width(&self) -> f64 {
        self.width * self.split_ratio()
    }

    pub fn right_width(&self) -> f64 {
        self.width - self.left_width()
    }

    pub fn left_x(&self) -> f64 {
        self.x
    }

    pub fn right_x(&self) -> f64 {
        self.x + self.left_width()
    }
}
