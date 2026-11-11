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
    pub resident_mb: f64,    // Private Anonymous RAM (RssAnon) - uniquely used by YoonSpace
    pub total_rss_mb: f64,   // Total VmRSS (including shared system libs)
    pub shared_mb: f64,      // Shared library pages (RssFile + RssShmem)
    pub virtual_mb: f64,     // Total virtual address space
}

#[cfg(target_os = "linux")]
fn get_descendant_pids(root_pid: u32) -> Vec<u32> {
    let mut pids = vec![root_pid];
    let mut i = 0;
    while i < pids.len() {
        let current_pid = pids[i];
        let children_path = format!("/proc/{}/task/{}/children", current_pid, current_pid);
        if let Ok(content) = fs::read_to_string(&children_path) {
            for part in content.split_whitespace() {
                if let Ok(child_pid) = part.parse::<u32>() {
                    if !pids.contains(&child_pid) {
                        pids.push(child_pid);
                    }
                }
            }
        }
        i += 1;
    }
    pids
}

pub fn get_process_memory() -> MemoryStats {
    #[cfg(target_os = "linux")]
    {
        let root_pid = std::process::id();
        let pids = get_descendant_pids(root_pid);

        let mut total_anon_kb: f64 = 0.0;
        let mut total_rss_kb: f64 = 0.0;
        let mut total_file_kb: f64 = 0.0;
        let mut total_shmem_kb: f64 = 0.0;
        let mut total_vm_size_kb: f64 = 0.0;
        let mut parsed_any = false;

        for pid in pids {
            let status_path = format!("/proc/{}/status", pid);
            if let Ok(status) = fs::read_to_string(&status_path) {
                parsed_any = true;
                for line in status.lines() {
                    if line.starts_with("RssAnon:") {
                        if let Some(val) = line.split_whitespace().nth(1) {
                            total_anon_kb += val.parse::<f64>().unwrap_or(0.0);
                        }
                    } else if line.starts_with("VmRSS:") {
                        if let Some(val) = line.split_whitespace().nth(1) {
                            total_rss_kb += val.parse::<f64>().unwrap_or(0.0);
                        }
                    } else if line.starts_with("RssFile:") {
                        if let Some(val) = line.split_whitespace().nth(1) {
                            total_file_kb += val.parse::<f64>().unwrap_or(0.0);
                        }
                    } else if line.starts_with("RssShmem:") {
                        if let Some(val) = line.split_whitespace().nth(1) {
                            total_shmem_kb += val.parse::<f64>().unwrap_or(0.0);
                        }
                    } else if line.starts_with("VmSize:") {
                        if let Some(val) = line.split_whitespace().nth(1) {
                            total_vm_size_kb += val.parse::<f64>().unwrap_or(0.0);
                        }
                    }
                }
            }
        }

        if parsed_any {
            return MemoryStats {
                resident_mb: ((total_anon_kb / 1024.0) * 10.0).round() / 10.0,
                total_rss_mb: ((total_rss_kb / 1024.0) * 10.0).round() / 10.0,
                shared_mb: (((total_file_kb + total_shmem_kb) / 1024.0) * 10.0).round() / 10.0,
                virtual_mb: ((total_vm_size_kb / 1024.0) * 10.0).round() / 10.0,
            };
        }
    }

    // Fallback: dynamically read memory via sysinfo
    let root_pid = std::process::id();
    let mut sys = sysinfo::System::new();
    let root_sys_pid = sysinfo::Pid::from_u32(root_pid);
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut total_memory_bytes: u64 = 0;
    let mut total_virtual_bytes: u64 = 0;

    for (pid, process) in sys.processes() {
        if *pid == root_sys_pid || process.parent() == Some(root_sys_pid) {
            total_memory_bytes += process.memory();
            total_virtual_bytes += process.virtual_memory();
        }
    }

    let rss_mb = (total_memory_bytes as f64) / (1024.0 * 1024.0);
    let vm_mb = (total_virtual_bytes as f64) / (1024.0 * 1024.0);

    MemoryStats {
        resident_mb: (rss_mb * 10.0).round() / 10.0,
        total_rss_mb: (rss_mb * 10.0).round() / 10.0,
        shared_mb: 0.0,
        virtual_mb: (vm_mb * 10.0).round() / 10.0,
    }
}
