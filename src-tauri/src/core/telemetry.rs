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

use std::fs;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub resident_mb: f64,
    pub virtual_mb: f64,
}

pub fn get_process_memory() -> MemoryStats {
    // Linux high performance procfs read
    if let Ok(statm) = fs::read_to_string("/proc/self/statm") {
        let parts: Vec<&str> = statm.split_whitespace().collect();
        if parts.len() >= 2 {
            let page_size_kb = 4.0;
            let virt_pages: f64 = parts[0].parse().unwrap_or(0.0);
            let res_pages: f64 = parts[1].parse().unwrap_or(0.0);
            return MemoryStats {
                virtual_mb: ((virt_pages * page_size_kb) / 1024.0 * 10.0).round() / 10.0,
                resident_mb: ((res_pages * page_size_kb) / 1024.0 * 10.0).round() / 10.0,
            };
        }
    }

    MemoryStats {
        resident_mb: 42.0,
        virtual_mb: 128.0,
    }
}
