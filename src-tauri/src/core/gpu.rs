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

/// Configure GPU preferences at application startup.
/// By default, Linux runs on the integrated GPU with standard zero-copy DMA-BUF.
/// If the user opts into discrete GPU via YOONSPACE_USE_DGPU, PRIME offload is enabled.
pub fn configure_universal_igpu() {
    // 1. If explicit sync is not explicitly configured, disable it to prevent
    // driver deadlock on older NVIDIA / Wayland explicit-sync combinations.
    if std::env::var("__NV_DISABLE_EXPLICIT_SYNC").is_err() {
        unsafe {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    }

    // 2. Opt into discrete GPU only when explicitly requested
    if std::env::var("YOONSPACE_USE_DGPU").is_ok() {
        unsafe {
            std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
            std::env::set_var("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
            std::env::set_var("DRI_PRIME", "1");
        }
    }
}

/// Identifies the active GPU render node currently opened by the process for telemetry.
pub fn get_active_gpu_name() -> String {
    let pid = std::process::id();
    let fd_dir = format!("/proc/{}/fd", pid);
    if let Ok(entries) = std::fs::read_dir(fd_dir) {
        for entry in entries.flatten() {
            if let Ok(link) = std::fs::read_link(entry.path()) {
                let s = link.to_string_lossy();
                if let Some(idx) = s.find("renderD") {
                    let render_node = &s[idx..];
                    let render_name = render_node.split('/').next().unwrap_or(render_node);
                    let dev_vendor_path = format!("/sys/class/drm/{}/device/vendor", render_name);
                    let vendor = std::fs::read_to_string(dev_vendor_path)
                        .map(|v| v.trim().to_lowercase())
                        .unwrap_or_default();
                    if vendor == "0x8086" {
                        return format!("Intel Iris/UHD iGPU ({})", render_name);
                    } else if vendor == "0x1002" {
                        return format!("AMD Radeon GPU ({})", render_name);
                    } else if vendor == "0x10de" {
                        return format!("NVIDIA GeForce GPU ({})", render_name);
                    } else {
                        return format!("GPU ({})", render_name);
                    }
                }
            }
        }
    }
    "Integrated GPU".to_string()
}
