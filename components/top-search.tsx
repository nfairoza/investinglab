"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search, CornerDownLeft } from "lucide-react";
import type { SymbolMatch } from "@/app/api/search/route";
import { OVERVIEW, SECTIONS, ADMIN_SECTION, isPathActive } from "@/lib/nav";

interface PageEntry { label: string; href: string; group: string }

function buildPages(isAdmin: boolean): PageEntry[] {
  const pages: PageEntry[] = [{ label: OVERVIEW.label, href: OVERVIEW.href, group: "Overview" }];
  for (const s of SECTIONS) for (const it of s.items) pages.push({ label: it.label, href: it.href, group: s.label });
  pages.push(
    { label: "Settings", href: "/settings", group: "Setup" },
    { label: "Profile", href: "/profile", group: "Setup" },
    { label: "Reports", href: "/reports", group: "Setup" },
    { label: "Help", href: "/help", group: "Setup" },
    { label: "Glossary", href: "/glossary", group: "Setup" },
  );
  if (isAdmin) for (const it of ADMIN_SECTION.items) pages.push({ label: it.label, href: it.href, group: "Admin" });
  return pages;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// Inline top-bar search: an actual input with a dropdown that appears ONLY while
// the user is typing — no full-screen modal, stays on the page. Searches tickers
// (→ Research) + pages (→ navigate).
export function TopSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: me } = useSWR<{ isAdmin?: boolean }>("/api/me", fetchJson, { revalidateOnFocus: false });
  const PAGES = buildPages(Boolean(me?.isAdmin));

  // Debounced ticker search — only when there's a query.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) { setMatches([]); return; }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const j = (await r.json()) as { matches?: SymbolMatch[] };
        setMatches(j.matches ?? []);
        setActive(0);
      } catch { setMatches([]); }
    }, 160);
    return () => clearTimeout(id);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pages = q.trim() ? PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())) : [];
  const options = [
    ...matches.map((m) => ({ type: "symbol" as const, key: `s-${m.symbol}`, primary: m.symbol, secondary: m.name, href: `/research?symbol=${m.symbol}` })),
    ...pages.map((p) => ({ type: "page" as const, key: `p-${p.href}`, primary: p.label, secondary: p.group, href: p.href })),
  ];

  const go = useCallback((href: string) => { setOpen(false); setQ(""); setMatches([]); router.push(href); }, [router]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[active]; if (o) go(o.href); else if (q.trim()) go(`/research?symbol=${q.trim().toUpperCase()}`); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const showDropdown = open && q.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-surface/60 px-3 text-sm">
        <Search size={15} className="shrink-0 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { if (q.trim()) setOpen(true); }}
          onKeyDown={onKey}
          placeholder="Search tickers, pages…"
          autoComplete="off"
          className="flex-1 bg-transparent text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      {showDropdown && (
        <ul className="absolute z-50 mt-1 max-h-[60vh] w-full overflow-auto rounded-xl border border-hairline-strong py-1 shadow-2xl"
          style={{ background: "var(--surface-solid)" }}>
          {options.length === 0 && <li className="px-4 py-3 text-center text-sm text-ink-faint">No matches.</li>}
          {options.map((o, i) => (
            <li key={o.key}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(o.href)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${i === active ? "bg-brand-500/15 text-ink" : "text-ink-dim hover:bg-surface"}`}>
                <span className="flex items-baseline gap-2">
                  <span className={`font-medium ${o.type === "symbol" ? "font-mono text-brand-300" : "text-ink"}`}>{o.primary}</span>
                  {o.secondary && <span className="truncate text-xs text-ink-faint">{o.secondary}</span>}
                </span>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
                  {o.type === "symbol" ? "Research" : "Go"}{i === active && <CornerDownLeft size={11} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
