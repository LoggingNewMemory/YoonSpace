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

import { tauriIpc } from "../services/tauri_ipc";
import type { DownloadItem } from "../types";

export interface DownloadController {
  refresh: () => Promise<void>;
  upsertItem: (item: DownloadItem) => void;
  showDrawer: () => void;
  hideDrawer: () => void;
  toggleDrawer: () => void;
  isDrawerOpen: () => boolean;
  // Aliases for compatibility
  showPopover: () => void;
  hidePopover: () => void;
  isPopoverOpen: () => boolean;
  showToast: (
    title: string,
    message: string,
    type: "info" | "success" | "error",
    actions?: { label: string; onClick: () => void }[]
  ) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(1));
  return `${val} ${sizes[i]}`;
}

const FILE_ICONS: Record<string, string> = {
  // Images
  png: "image", jpg: "image", jpeg: "image", jpe: "image", jfif: "image",
  webp: "image", gif: "image", svg: "image", ico: "image", bmp: "image",
  // PDF
  pdf: "picture_as_pdf",
  // Archives
  zip: "folder_zip", tar: "folder_zip", gz: "folder_zip", tgz: "folder_zip",
  bz2: "folder_zip", "7z": "folder_zip", rar: "folder_zip",
  // Terminal / Executables / Scripts
  deb: "terminal", rpm: "terminal", sh: "terminal", bin: "terminal", run: "terminal",
  // Audio
  mp3: "audio_file", wav: "audio_file", ogg: "audio_file", flac: "audio_file",
  // Video
  mp4: "video_file", webm: "video_file", mkv: "video_file", mov: "video_file",
  // Code
  js: "code", ts: "code", html: "code", css: "code", json: "code",
  rs: "code", py: "code", c: "code", cpp: "code",
  // Documents
  txt: "description", md: "description", doc: "description", docx: "description",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return FILE_ICONS[ext] || "draft";
}

export function initDownloadsUI(
  btn: HTMLButtonElement,
  badge: HTMLElement,
  icon: HTMLElement,
  onToggle?: (isOpen: boolean) => void,
  onOpenSettings?: () => void
): DownloadController {
  // 1. Create Downloads Sidebar Drawer (Matches YoonSpace Shields Sidebar)
  const sidebar = document.createElement("aside");
  sidebar.id = "yoonspace-downloads-sidebar";
  sidebar.className =
    "hidden fixed right-0 top-[80px] bottom-0 z-40 w-[360px] flex flex-col border-l border-[#2e2e30] bg-[#171718] text-[#e5e2e1] shadow-2xl select-none overflow-hidden transition-all duration-200 ease-out";
  sidebar.style.top = "80px";

  sidebar.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[#2e2e30] bg-[#1a1a1c]">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-[#28282b] flex items-center justify-center text-[#f85e2a]">
          <span class="material-symbols-outlined text-[18px]">download</span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white tracking-tight">Downloads</h2>
            <span id="downloads-header-count" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f85e2a]/20 text-[#f85e2a] border border-[#f85e2a]/30">0</span>
          </div>
          <p id="downloads-header-subtitle" class="text-[11px] text-neutral-400 font-mono mt-0.5">Files and images</p>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <button
          type="button"
          id="btn-downloads-open-folder"
          title="Open Downloads Folder"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none"
        >
          <span class="material-symbols-outlined text-[18px]">folder_open</span>
        </button>
        <button
          type="button"
          id="btn-downloads-clear"
          title="Clear Finished Downloads"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none"
        >
          <span class="material-symbols-outlined text-[18px]">clear_all</span>
        </button>
        <button
          type="button"
          id="btn-close-downloads"
          aria-label="Close Downloads"
          title="Close Downloads"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-[#9c9a98] hover:text-[#e5e2e1] hover:bg-[#28282b] active:scale-95 transition-all cursor-pointer select-none"
        >
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>

    <!-- Downloads List -->
    <div id="downloads-sidebar-list" class="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 custom-scrollbar" style="scrollbar-width: thin;">
      <!-- Populated dynamically -->
    </div>

    <!-- Footer / Directory Info & Settings -->
    <div class="px-4 py-2.5 border-t border-[#2e2e30] bg-[#1a1a1c] flex items-center justify-between text-[11px] text-neutral-400">
      <div class="flex items-center gap-1.5 truncate max-w-[240px]">
        <span class="material-symbols-outlined text-sm text-[#f85e2a]">folder</span>
        <span id="downloads-footer-dir" class="truncate font-mono">Downloads</span>
      </div>
      <button
        type="button"
        id="btn-downloads-settings"
        title="Download Settings"
        class="text-[#ffb59e] hover:text-white transition-colors cursor-pointer text-[11px] font-medium"
      >
        Settings
      </button>
    </div>
  `;

  // 2. Create Toast Notification Container
  const toastContainer = document.createElement("div");
  toastContainer.id = "yoonspace-toast-container";
  toastContainer.className =
    "fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full";

  if (document.body) {
    document.body.appendChild(sidebar);
    document.body.appendChild(toastContainer);
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(sidebar);
      document.body.appendChild(toastContainer);
    });
  }

  const listContainer = sidebar.querySelector("#downloads-sidebar-list") as HTMLElement;
  const countBadge = sidebar.querySelector("#downloads-header-count") as HTMLElement;
  const subtitleEl = sidebar.querySelector("#downloads-header-subtitle") as HTMLElement;
  const footerDirEl = sidebar.querySelector("#downloads-footer-dir") as HTMLElement;
  const btnOpenFolder = sidebar.querySelector("#btn-downloads-open-folder") as HTMLButtonElement;
  const btnClear = sidebar.querySelector("#btn-downloads-clear") as HTMLButtonElement;
  const btnClose = sidebar.querySelector("#btn-close-downloads") as HTMLButtonElement;
  const btnSettings = sidebar.querySelector("#btn-downloads-settings") as HTMLButtonElement;

  let cachedDownloads: DownloadItem[] = [];

  function updateFooterDir() {
    tauriIpc.getAppConfig().then((cfg) => {
      if (footerDirEl && cfg?.download_settings?.download_dir) {
        const dir = cfg.download_settings.download_dir;
        const home = "/home/";
        if (dir.startsWith(home)) {
          const parts = dir.split("/");
          if (parts.length >= 3) {
            footerDirEl.textContent = "~/" + parts.slice(3).join("/");
            footerDirEl.title = dir;
            return;
          }
        }
        footerDirEl.textContent = dir;
        footerDirEl.title = dir;
      }
    }).catch(() => {});
  }

  updateFooterDir();

  function updateBadge() {
    const activeDownloads = cachedDownloads.filter((d) => d.state === "downloading");
    if (activeDownloads.length > 0) {
      badge.textContent = activeDownloads.length.toString();
      badge.classList.remove("hidden");
      badge.classList.add("animate-pulse");
      icon.classList.add("text-[#f85e2a]");
      if (subtitleEl) {
        subtitleEl.textContent = `${activeDownloads.length} active download${activeDownloads.length > 1 ? "s" : ""}`;
      }
    } else {
      const recent = cachedDownloads.filter((d) => d.state === "completed").length;
      if (recent > 0) {
        badge.textContent = recent > 9 ? "9+" : recent.toString();
        badge.classList.remove("hidden");
        badge.classList.remove("animate-pulse");
        icon.classList.remove("text-[#f85e2a]");
      } else {
        badge.classList.add("hidden");
        badge.classList.remove("animate-pulse");
        icon.classList.remove("text-[#f85e2a]");
      }
      if (subtitleEl) {
        subtitleEl.textContent = cachedDownloads.length > 0
          ? `${cachedDownloads.length} total item${cachedDownloads.length > 1 ? "s" : ""}`
          : "Files and images";
      }
    }
    if (countBadge) {
      countBadge.textContent = cachedDownloads.length.toString();
    }
  }

  function renderList() {
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (cachedDownloads.length === 0) {
      listContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center text-[#8e8d91] gap-2.5 select-none">
          <div class="w-12 h-12 rounded-2xl bg-[#202022] border border-[#2e2e32] flex items-center justify-center text-[#8e8d91]/50">
            <span class="material-symbols-outlined text-3xl">cloud_download</span>
          </div>
          <div class="text-xs font-semibold text-neutral-300 mt-1">No downloads yet</div>
          <p class="text-[11px] text-[#6e6d72] max-w-[220px] leading-relaxed">
            Files and saved images will appear here with real-time download status
          </p>
        </div>
      `;
      return;
    }

    cachedDownloads.forEach((item) => {
      const row = document.createElement("div");
      row.className =
        "flex flex-col gap-2 p-3 rounded-xl bg-[#202022] hover:bg-[#252528] border border-[#2e2e32] hover:border-[#3a3a40] transition-all duration-150 group cursor-pointer relative shadow-sm";

      const fileIcon = getFileIcon(item.filename);
      const isDownloading = item.state === "downloading";
      const isCompleted = item.state === "completed";
      const isFailed = item.state === "failed";
      const isCancelled = item.state === "cancelled";

      let statusHtml = "";
      if (isDownloading) {
        const pct = Math.round(item.progress * 100);
        const recStr = formatBytes(item.received_bytes);
        const totStr = item.total_bytes > 0 ? formatBytes(item.total_bytes) : "Unknown";
        statusHtml = `
          <div class="flex flex-col gap-1.5 w-full mt-1.5">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-[#ffb59e] font-mono">${recStr} of ${totStr}</span>
              <span class="text-[#f85e2a] font-mono font-bold">${pct}%</span>
            </div>
            <div class="w-full h-1.5 bg-[#2c2c34] rounded-full overflow-hidden">
              <div class="h-full bg-[#f85e2a] rounded-full transition-all duration-200" style="width: ${Math.max(5, pct)}%"></div>
            </div>
          </div>
        `;
      } else if (isCompleted) {
        const sizeStr = item.received_bytes > 0 ? formatBytes(item.received_bytes) : (item.total_bytes > 0 ? formatBytes(item.total_bytes) : "");
        statusHtml = `
          <div class="flex items-center gap-2 text-[11px] text-[#8e8d91] mt-0.5">
            <span class="text-[#71d98d] font-semibold flex items-center gap-0.5">
              <span class="material-symbols-outlined text-xs">check_circle</span> Complete
            </span>
            ${sizeStr ? `<span>•</span><span class="font-mono">${sizeStr}</span>` : ""}
          </div>
        `;
      } else if (isFailed) {
        const errMsg = escapeHtml(item.error || "Unknown error");
        statusHtml = `
          <div class="flex items-center gap-1.5 text-[11px] text-[#ff5449] mt-0.5" title="${errMsg}">
            <span class="material-symbols-outlined text-xs">error</span>
            <span class="truncate">Failed: ${errMsg}</span>
          </div>
        `;
      } else if (isCancelled) {
        statusHtml = `
          <div class="flex items-center gap-1 text-[11px] text-[#8e8d91] mt-0.5">
            <span class="material-symbols-outlined text-xs">cancel</span> Cancelled
          </div>
        `;
      }

      const safeFilename = escapeHtml(item.filename);
      const safeId = escapeHtml(item.id);
      const safeDest = escapeHtml(item.destination);

      row.innerHTML = `
        <div class="flex items-start justify-between gap-2.5">
          <div class="flex items-center gap-2.5 truncate flex-1 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-[#29292e] flex items-center justify-center shrink-0 text-[#ffb59e] border border-[#383840]">
              <span class="material-symbols-outlined text-lg">${fileIcon}</span>
            </div>
            <div class="flex flex-col truncate flex-1 text-left min-w-0">
              <span class="text-xs font-semibold text-white truncate" title="${safeFilename}">${safeFilename}</span>
              ${statusHtml}
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            ${
              isDownloading
                ? `
                <button
                  type="button"
                  class="btn-cancel-dl w-6 h-6 rounded-md hover:bg-[#34343d] text-[#8e8d91] hover:text-[#ff5449] flex items-center justify-center transition-colors cursor-pointer"
                  title="Cancel download"
                  data-dl-id="${safeId}"
                >
                  <span class="material-symbols-outlined text-sm">close</span>
                </button>
              `
                : ""
            }
            ${
              isCompleted
                ? `
                <button
                  type="button"
                  class="btn-open-file w-6 h-6 rounded-md hover:bg-[#34343d] text-[#8e8d91] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Open file"
                  data-dl-id="${safeId}"
                >
                  <span class="material-symbols-outlined text-sm">open_in_new</span>
                </button>
                <button
                  type="button"
                  class="btn-show-folder w-6 h-6 rounded-md hover:bg-[#34343d] text-[#8e8d91] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Show in folder"
                  data-dl-dest="${safeDest}"
                >
                  <span class="material-symbols-outlined text-sm">folder</span>
                </button>
              `
                : ""
            }
          </div>
        </div>
      `;

      // Click card to open file if completed
      row.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".btn-cancel-dl, .btn-show-folder, .btn-open-file")) return;
        if (isCompleted && item.destination) {
          tauriIpc.openDownloadFile(item.id);
        }
      });

      // Open file button
      row.querySelector(".btn-open-file")?.addEventListener("click", (e) => {
        e.stopPropagation();
        tauriIpc.openDownloadFile(item.id);
      });

      // Show in folder button
      row.querySelector(".btn-show-folder")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.destination) {
          const folder = item.destination.substring(0, item.destination.lastIndexOf("/"));
          tauriIpc.openDownloadDir(folder);
        } else {
          tauriIpc.openDownloadDir();
        }
      });

      // Cancel button
      row.querySelector(".btn-cancel-dl")?.addEventListener("click", (e) => {
        e.stopPropagation();
        tauriIpc.cancelDownload(item.id);
      });

      listContainer.appendChild(row);
    });
  }

  async function refresh(): Promise<void> {
    try {
      cachedDownloads = await tauriIpc.getDownloads();
      updateBadge();
      updateFooterDir();
      if (!sidebar.classList.contains("hidden")) {
        renderList();
      }
    } catch (e) {
      console.warn("Failed to refresh downloads:", e);
    }
  }

  function upsertItem(item: DownloadItem): void {
    const idx = cachedDownloads.findIndex((d) => d.id === item.id);
    if (idx >= 0) {
      cachedDownloads[idx] = item;
    } else {
      cachedDownloads.unshift(item);
    }
    updateBadge();
    if (!sidebar.classList.contains("hidden")) {
      renderList();
    }
  }

  function showDrawer() {
    sidebar.classList.remove("hidden");
    btn.classList.add("bg-[#28282b]", "text-[#e5e2e1]");
    onToggle?.(true);
    refresh();
  }

  function hideDrawer() {
    sidebar.classList.add("hidden");
    btn.classList.remove("bg-[#28282b]", "text-[#e5e2e1]");
    onToggle?.(false);
  }

  function toggleDrawer() {
    if (sidebar.classList.contains("hidden")) {
      showDrawer();
    } else {
      hideDrawer();
    }
  }

  function showToast(
    title: string,
    message: string,
    type: "info" | "success" | "error",
    actions?: { label: string; onClick: () => void }[]
  ) {
    if (!toastContainer) return;

    const toast = document.createElement("div");
    toast.className =
      "pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border border-[#2e2e32] bg-[#1a1a1d]/95 backdrop-blur-xl text-[#e5e2e1] shadow-2xl transition-all duration-300 ease-out transform translate-y-2 opacity-0";

    const iconType =
      type === "success"
        ? "check_circle"
        : type === "error"
        ? "error"
        : "downloading";
    const iconColor =
      type === "success"
        ? "text-[#71d98d]"
        : type === "error"
        ? "text-[#ff5449]"
        : "text-[#f85e2a]";

    let actionsHtml = "";
    if (actions && actions.length > 0) {
      actionsHtml = `
        <div class="flex items-center gap-2 mt-2">
          ${actions
            .map(
              (act, idx) => `
            <button
              type="button"
              class="toast-action-btn px-2.5 py-1 rounded-lg bg-[#25252b] hover:bg-[#34343c] text-xs font-semibold text-[#e2bfb4] hover:text-white transition-colors cursor-pointer border border-[#36363f]"
              data-action-index="${idx}"
            >
              ${act.label}
            </button>
          `
            )
            .join("")}
        </div>
      `;
    }

    toast.innerHTML = `
      <span class="material-symbols-outlined ${iconColor} text-xl shrink-0 mt-0.5">${iconType}</span>
      <div class="flex flex-col flex-1 min-w-0">
        <div class="text-xs font-bold text-white tracking-tight truncate">${title}</div>
        <div class="text-[11px] text-[#a09e9d] mt-0.5 leading-relaxed truncate">${message}</div>
        ${actionsHtml}
      </div>
      <button
        type="button"
        class="toast-close-btn w-5 h-5 rounded-md hover:bg-[#25252b] text-[#8e8d91] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
        title="Dismiss"
      >
        <span class="material-symbols-outlined text-sm">close</span>
      </button>
    `;

    toast.querySelector(".toast-close-btn")?.addEventListener("click", () => {
      dismissToast(toast);
    });

    if (actions && actions.length > 0) {
      toast.querySelectorAll(".toast-action-btn").forEach((btnEl) => {
        btnEl.addEventListener("click", (e) => {
          const idxStr = (e.currentTarget as HTMLElement).getAttribute("data-action-index");
          if (idxStr !== null) {
            const idx = parseInt(idxStr, 10);
            actions[idx]?.onClick();
            dismissToast(toast);
          }
        });
      });
    }

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove("translate-y-2", "opacity-0");
    });

    const timeoutMs = type === "error" ? 6000 : 5000;
    const timer = setTimeout(() => {
      dismissToast(toast);
    }, timeoutMs);

    function dismissToast(el: HTMLElement) {
      clearTimeout(timer);
      el.classList.add("translate-y-2", "opacity-0");
      setTimeout(() => {
        el.remove();
      }, 300);
    }
  }

  // Button Listeners
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDrawer();
  });

  btnOpenFolder?.addEventListener("click", () => {
    tauriIpc.openDownloadDir();
  });

  btnClear?.addEventListener("click", async () => {
    await tauriIpc.clearDownloads();
    await refresh();
  });

  btnClose?.addEventListener("click", () => {
    hideDrawer();
  });

  btnSettings?.addEventListener("click", () => {
    hideDrawer();
    onOpenSettings?.();
  });

  // Close when clicking outside
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (
      !sidebar.classList.contains("hidden") &&
      !sidebar.contains(target) &&
      !btn.contains(target)
    ) {
      hideDrawer();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sidebar.classList.contains("hidden")) {
      hideDrawer();
    }
  });

  // Initial refresh
  refresh();

  return {
    refresh,
    upsertItem,
    showDrawer,
    hideDrawer,
    toggleDrawer,
    isDrawerOpen: () => !sidebar.classList.contains("hidden"),
    // Aliases
    showPopover: showDrawer,
    hidePopover: hideDrawer,
    isPopoverOpen: () => !sidebar.classList.contains("hidden"),
    showToast,
  };
}
