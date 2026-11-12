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

#[cfg(target_os = "linux")]
#[derive(Debug, Clone)]
pub struct DetectedGpu {
    pub card: String,
    pub vendor: String,
    pub pci_id: String,
    pub boot_vga: bool,
    pub driver: String,
    pub is_discrete: bool,
}

#[cfg(target_os = "linux")]
pub fn detect_gpus() -> Vec<DetectedGpu> {
    let mut gpus = Vec::new();
    let entries = match std::fs::read_dir("/sys/class/drm") {
        Ok(e) => e,
        Err(_) => return gpus,
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Match primary card nodes (card0, card1) and ignore connector symlinks (card0-DP-1, etc.)
        if !name.starts_with("card") || name[4..].contains('-') {
            continue;
        }

        let device_path = entry.path().join("device");
        if !device_path.exists() {
            continue;
        }

        let vendor = std::fs::read_to_string(device_path.join("vendor"))
            .map(|s| s.trim().to_lowercase())
            .unwrap_or_default();

        let boot_vga = std::fs::read_to_string(device_path.join("boot_vga"))
            .map(|s| s.trim() == "1")
            .unwrap_or(false);

        let driver = std::fs::read_link(device_path.join("driver"))
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_default();

        let pci_id = std::fs::canonicalize(&device_path)
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_default();

        // Identify discrete GPUs: NVIDIA discrete, or secondary non-boot PCIe GPUs
        let is_discrete = (vendor == "0x10de" && !boot_vga)
            || (!boot_vga && pci_id != "0000:00:02.0" && (driver == "nvidia" || driver == "nouveau" || driver == "amdgpu"));

        gpus.push(DetectedGpu {
            card: name,
            vendor,
            pci_id,
            boot_vga,
            driver,
            is_discrete,
        });
    }

    gpus
}

/// Universal hybrid GPU preference configuration:
/// Automatically prioritizes the integrated GPU (Intel Iris/UHD, AMD Radeon Graphics, etc.)
/// on hybrid systems to maximize battery life, keep laptop fans quiet, and utilize power-efficient
/// hardware video decoders (VA-API / QuickSync), while leaving discrete GPUs asleep.
#[cfg(target_os = "linux")]
pub fn configure_universal_igpu() {
    // If the user explicitly opted into discrete GPU, respect it!
    if std::env::var("YOONSPACE_USE_DGPU").is_ok()
        || std::env::var("__NV_PRIME_RENDER_OFFLOAD").is_ok()
        || std::env::var("DRI_PRIME").map(|v| v == "1").unwrap_or(false)
    {
        return;
    }

    let gpus = detect_gpus();

    // Only apply hybrid offload overrides if there is more than 1 GPU and a discrete GPU exists
    if gpus.len() > 1 && gpus.iter().any(|g| g.is_discrete) {
        if let Some(target_igpu) = gpus.iter().find(|g| !g.is_discrete) {
            // Find Mesa EGL vendor configuration (drives Intel Iris/UHD, AMD Radeon APU, etc.)
            let mesa_vendor_candidates = [
                "/usr/share/glvnd/egl_vendor.d/50_mesa.json",
                "/etc/glvnd/egl_vendor.d/50_mesa.json",
                "/usr/local/share/glvnd/egl_vendor.d/50_mesa.json",
            ];

            if let Some(mesa_json) = mesa_vendor_candidates.iter().find(|p| std::path::Path::new(p).exists()) {
                // SAFETY: Called single-threaded at process startup in main() before libraries initialize
                unsafe {
                    std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", mesa_json);
                }
            }

            // Convert PCI bus ID (e.g. "0000:00:02.0") to DRI_PRIME format ("pci-0000_00_02_0")
            let dri_prime_val = if !target_igpu.pci_id.is_empty() {
                format!("pci-{}", target_igpu.pci_id.replace([':', '.'], "_"))
            } else {
                "0".to_string()
            };

            unsafe {
                std::env::set_var("__GLX_VENDOR_LIBRARY_NAME", "mesa");
                std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "0");
                std::env::set_var("DRI_PRIME", &dri_prime_val);

                // Prioritize the appropriate open-source Vulkan driver
                if target_igpu.vendor == "0x8086" {
                    std::env::set_var("VK_LOADER_DRIVERS_SELECT", "*intel*");
                } else if target_igpu.vendor == "0x1002" {
                    std::env::set_var("VK_LOADER_DRIVERS_SELECT", "*radv*:*amd*");
                }
            }
        }
    }
}
