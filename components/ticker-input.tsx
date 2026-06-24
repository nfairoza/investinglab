"use client";

import { useEffect, useRef, useState } from "react";
import type { SymbolMatch } from "@/app/api/search/route";

// Robinhood-style ticker autocomplete. Debounced search against /api/search;
// arrow keys + Enter to pick; onSelect fires with the chosen symbol.
export function TickerInput({
  value,
  onChange,
  onSelect,
  placeholder = "Search ticker or company…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  // Only search + open the dropdown when the user is ACTIVELY typing. Programmatic
  // value changes (a selection, or a symbol arriving via the URL/parent) must NOT
  // pop the dropdown open.
  const typing = useRef(false);

  // Debounced fetch — gated on active typing.
  useEffect(() => {
    if (!typing.current) return;
    const q = value.trim();
    if (q.length < 1) { setMatches([]); setOpen(false); return; }
    const id = setTimeout(async () => {
      if (!typing.current) return;
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { matches: SymbolMatch[] };
        setMatches(j.matches ?? []);
        setActive(0);
        setOpen(true);
      } catch { setMatches([]); }
    }, 180);
    return () => clearTimeout(id);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(m: SymbolMatch) {
    typing.current = false; // selection is not typing → keep the dropdown closed
    onChange(m.symbol);
    setOpen(false);
    setMatches([]);
    onSelect(m.symbol);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "Enter") onSelect(value.trim().toUpperCase());
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(matches[active]); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={(e) => { typing.current = true; onChange(e.target.value); }}
        onKeyDown={onKey}
        placeholder={placeholder}
        autoComplete="off"
        className={className || "w-64 rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none"}
      />
      {open && matches.length > 0 && (
        <ul
          className="absolute z-40 mt-1 max-h-72 w-full min-w-[18rem] overflow-auto rounded-xl border border-hairline-strong py-1 shadow-2xl"
          style={{ background: "var(--surface-solid)", backdropFilter: "blur(8px)" }}
        >
          {matches.map((m, i) => (
            <li key={`${m.symbol}-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-brand-500/15" : "hover:bg-surface"
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-medium text-brand-300">{m.symbol}</span>
                  <span className="truncate text-xs text-ink-dim">{m.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-ink-faint">{m.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
