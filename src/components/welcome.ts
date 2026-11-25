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

import type { AppConfig } from "../types";

export interface WelcomeScreenElement extends HTMLDivElement {
  refreshEngines: (updatedConfig: AppConfig) => void;
}

const escapeChipHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function createWelcomeScreen(
  config: AppConfig,
  onSearch: (query: string, engineId: string) => void,
  onSelectEngine: (engineId: string) => void
): WelcomeScreenElement {
  const container = document.createElement("div") as WelcomeScreenElement;
  container.className = "w-full max-w-3xl flex flex-col items-center gap-7 mx-auto";

  let currentConfig = config;
  let activeEngine = config.active_search_engine;

  container.innerHTML = `
    <!-- Horizontal Hero Section (No background on logo) -->
    <section class="w-full flex flex-row items-center justify-start gap-5 text-left select-none">
      <div class="flex-shrink-0 bg-transparent">
        <img src="/logo.png" alt="YoonSpace Logo" class="w-14 h-14 object-contain bg-transparent" />
      </div>

      <!-- Vertical Divider -->
      <div class="w-px h-12 bg-white/20" aria-hidden="true"></div>

      <!-- Left-aligned Title & Subtitle -->
      <div class="flex flex-col items-start justify-center">
        <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-[#e5e2e1]">
          Welcome to <span style="color: #e95420;">YoonSpace</span>
        </h1>
        <p class="text-sm text-[#e2bfb4] mt-1 tracking-wide flex items-center">
          <span>A browser for&nbsp;</span>
          <span
            id="role-rotator"
            class="font-semibold tracking-wide tabular-nums inline-block"
          >
            <span class="text-[#ffb59e]">Engineers</span>
          </span>
        </p>
      </div>
    </section>

    <!-- Engineer Omni Command Input -->
    <section class="w-full flex flex-col items-center">
      <div class="w-full flex flex-col gap-3">
        <form id="omni-search-form" class="w-full">
          <div id="omni-search-box" class="relative w-full rounded-xl bg-[#2a2a2a] p-1.5 shadow-xl border border-[#353535] focus-within:border-[#f85e2a] focus-within:ring-1 focus-within:ring-[#f85e2a] transition-all cursor-text group">
            <div class="flex items-center gap-2.5 px-3 py-1.5">
              <span class="flex items-center justify-center text-[#ffb59e] text-base font-bold select-none pr-1 pointer-events-none">
                &gt;
              </span>
              <input
                id="engineerOmniInput"
                class="flex-1 bg-transparent text-sm text-[#e5e2e1] placeholder-[#aa8a80] outline-none border-none focus:ring-0 selection:bg-[#f85e2a] selection:text-white"
                placeholder="Search the World..."
                type="text"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                id="engineerOmniClear"
                type="button"
                title="Clear input"
                aria-label="Clear input"
                class="w-5 h-5 rounded flex items-center justify-center text-[#8e8a88] hover:text-[#e5e2e1] hover:bg-[#383838] transition-colors cursor-pointer shrink-0 hidden mr-1"
              >
                <span class="material-symbols-outlined text-[14px]">close</span>
              </button>
              <button
                id="engineerOmniEnterBtn"
                type="submit"
                title="Search (Enter)"
                class="hidden sm:flex items-center gap-1 bg-[#0e0e0e] hover:bg-[#1a1a1a] px-2 py-1 rounded text-[#aa8a80] hover:text-[#e5e2e1] text-[11px] font-medium shadow-inner border border-[#353535] select-none cursor-pointer transition-colors"
              >
                <span class="text-[#e5e2e1] font-bold">ENTER</span>
              </button>
            </div>
          </div>
        </form>

        <!-- Search Engine Chips -->
        <div id="search-engine-chips" class="flex items-center justify-center gap-2 flex-wrap pt-1 select-none">
        </div>
      </div>
    </section>
  `;

  const chipsContainer = container.querySelector("#search-engine-chips") as HTMLElement;

  const renderSearchEngineChips = () => {
    chipsContainer.innerHTML = currentConfig.search_engines
      .map((engine) => {
        const isActive = engine.id === activeEngine;
        const pillBase = isActive
          ? "bg-[#f85e2a] text-[#521300] shadow-sm font-semibold"
          : "bg-[#202020] text-[#e2bfb4] hover:text-[#e5e2e1] hover:bg-[#2a2a2a] border border-[#353535]/50 font-medium";

        return `
          <button
            type="button"
            data-engine-id="${escapeChipHtml(engine.id)}"
            class="engine-chip px-3 py-1 rounded-full text-xs flex items-center transition-all cursor-pointer ${pillBase}"
          >
            <span>${escapeChipHtml(engine.name)}</span>
          </button>
        `;
      })
      .join("");

    chipsContainer.querySelectorAll(".engine-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const engineId = btn.getAttribute("data-engine-id")!;
        activeEngine = engineId;
        currentConfig.active_search_engine = engineId;
        renderSearchEngineChips();
        onSelectEngine(engineId);
      });
    });
  };

  container.refreshEngines = (updatedConfig: AppConfig) => {
    currentConfig = updatedConfig;
    activeEngine = updatedConfig.active_search_engine;
    renderSearchEngineChips();
  };

  renderSearchEngineChips();

  // Search submission and typing capability
  const form = container.querySelector("#omni-search-form") as HTMLFormElement;
  const input = container.querySelector("#engineerOmniInput") as HTMLInputElement;
  const omniSearchBox = container.querySelector("#omni-search-box") as HTMLElement | null;
  const omniClearBtn = container.querySelector("#engineerOmniClear") as HTMLButtonElement | null;

  const updateOmniClear = () => {
    if (omniClearBtn) {
      if (input.value.trim().length > 0) {
        omniClearBtn.classList.remove("hidden");
      } else {
        omniClearBtn.classList.add("hidden");
      }
    }
  };

  // Clicking anywhere on the full search bar box focuses and selects the input
  omniSearchBox?.addEventListener("click", (e) => {
    if (e.target !== omniClearBtn && !omniClearBtn?.contains(e.target as Node)) {
      input.focus();
    }
  });

  input?.addEventListener("focus", () => {
    input.select();
    updateOmniClear();
  });

  input?.addEventListener("input", () => {
    updateOmniClear();
  });

  omniClearBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    input.value = "";
    updateOmniClear();
    input.focus();
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      onSearch(query, activeEngine);
    }
  });

  // Hacker/Terminal Scramble & Typewriter Decoder Effect
  const roleRotator = container.querySelector("#role-rotator") as HTMLElement | null;
  if (roleRotator) {
    const roles = [
      "Engineers",
      "Programmers",
      "Hackers",
      "Developers",
      "Vibe Coders",
      "AI Researchers",
      "Prompt Engineers",
      "LLM Whisperers",
      "Model Builders",
      "Agent Architects",
      "Architects",
      "Builders",
      "Sysadmins",
      "DevOps",
      "SREs",
      "ML Engineers",
      "Neural Crafters",
      "Tinkerers",
      "Terminal Junkies",
      "Makers",
      "Code Ninjas",
      "Founders",
      "Data Scientists",
      "Full-Stack Devs",
      "Kernel Hackers",
      "Security Geeks",
      "AI Enthusiasts",
      "Context Wranglers",
      "Synthetic Thinkers",
      "Cyberpunks",
    ];

    const chars = "0123456789!@#$%^&*<>[]{}/*+=~_";
    const escapeHtml = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    let roleIndex = 0;
    let isAnimating = false;

    const scrambleTransition = (fromWord: string, toWord: string, onComplete: () => void) => {
      const scrambleFrames = 7;  // Snappy burst of random numbers & symbols (~280ms)
      const decodeFrames = 18;   // Smooth progressive typewriter decode (~720ms)
      const totalFrames = scrambleFrames + decodeFrames;
      const frameDurationMs = 40;
      let currentFrame = 0;

      const timer = setInterval(() => {
        if (!container.isConnected) {
          clearInterval(timer);
          isAnimating = false;
          return;
        }

        currentFrame++;

        if (currentFrame <= scrambleFrames) {
          // Phase 1: Random numbers & symbols burst
          const len = Math.max(fromWord.length, toWord.length);
          let scrambled = "";
          for (let i = 0; i < len; i++) {
            scrambled += chars[Math.floor(Math.random() * chars.length)];
          }
          roleRotator.innerHTML = `<span class="text-[#f85e2a] opacity-90">${escapeHtml(scrambled)}</span>`;
        } else if (currentFrame < totalFrames) {
          // Phase 2: Progressive typewriter decode
          const progress = (currentFrame - scrambleFrames) / decodeFrames;
          const resolvedCount = Math.floor(progress * toWord.length);
          const resolved = toWord.slice(0, resolvedCount);
          const targetLen = Math.max(
            toWord.length,
            Math.round(fromWord.length * (1 - progress) + toWord.length * progress)
          );
          const scrambledCount = Math.max(0, targetLen - resolvedCount);

          let scrambled = "";
          for (let i = 0; i < scrambledCount; i++) {
            scrambled += chars[Math.floor(Math.random() * chars.length)];
          }

          roleRotator.innerHTML = `<span class="text-[#ffb59e]">${escapeHtml(resolved)}</span><span class="text-[#f85e2a] opacity-90">${escapeHtml(scrambled)}</span>`;
        } else {
          // Phase 3: Final target word settled
          clearInterval(timer);
          roleRotator.innerHTML = `<span class="text-[#ffb59e]">${escapeHtml(toWord)}</span>`;
          isAnimating = false;
          onComplete();
        }
      }, frameDurationMs);
    };

    const nextWord = () => {
      if (!container.isConnected || isAnimating) return;
      isAnimating = true;
      const currentWord = roles[roleIndex];
      roleIndex = (roleIndex + 1) % roles.length;
      const targetWord = roles[roleIndex];

      scrambleTransition(currentWord, targetWord, () => {
        setTimeout(nextWord, 4000);
      });
    };

    setTimeout(nextWord, 4000);
  }

  return container;
}
