"use client";

import { Search } from "lucide-react";

// Top-bar search affordance. It looks like an input but opens the existing
// Command Palette (⌘K) — one search engine for tickers + pages, no duplicate logic.
function openPalette() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

export function TopSearch() {
  return (
    <button
      onClick={openPalette}
      className="group flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-hairline bg-surface/60 px-3 text-left text-sm text-ink-faint transition-colors hover:bg-surface hover:text-ink-dim"
      title="Search tickers and pages (⌘K)"
    >
      <Search size={15} className="shrink-0" />
      <span className="flex-1 truncate">Search tickers, pages…</span>
      <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-faint sm:inline">⌘K</kbd>
    </button>
  );
}
