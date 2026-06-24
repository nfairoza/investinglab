"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search, CornerDownLeft } from "lucide-react";
import type { SymbolMatch } from "@/app/api/search/route";
import { OVERVIEW, SECTIONS, ADMIN_SECTION } from "@/lib/nav";

interface PageEntry { label: string; href: string; group: string }

// Pages reachable from the palette — derived from the single nav source of
// truth so it never drifts from the sidebar. Setup pages + admin are appended;
// admin pages are only shown to admins.
function buildPages(isAdmin: boolean): PageEntry[] {
  const pages: PageEntry[] = [{ label: OVERVIEW.label, href: OVERVIEW.href, group: "Overview" }];
  for (const s of SECTIONS) {
    for (const it of s.items) pages.push({ label: it.label, href: it.href, group: s.label });
  }
  pages.push(
    { label: "Settings", href: "/settings", group: "Setup" },
    { label: "Profile", href: "/profile", group: "Setup" },
    { label: "Reports", href: "/reports", group: "Setup" },
    { label: "Help", href: "/help", group: "Setup" },
    { label: "Glossary", href: "/glossary", group: "Setup" },
  );
  if (isAdmin) {
    for (const it of ADMIN_SECTION.items) pages.push({ label: it.label, href: it.href, group: "Admin" });
  }
  return pages;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<SymbolMatch[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { data: me } = useSWR<{ isAdmin?: boolean }>("/api/me", fetchJson, { revalidateOnFocus: false });
  const PAGES = buildPages(Boolean(me?.isAdmin));

  // Global ⌘K / Ctrl-K to open, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(""); setMatches([]); setActive(0); }
  }, [open]);

  // Debounced symbol search.
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

  const pages = q.trim()
    ? PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase()))
    : PAGES;

  // Flattened option list for keyboard nav: symbols first, then pages.
  const options: { type: "symbol" | "page"; key: string; primary: string; secondary?: string; href: string }[] = [
    ...matches.map((m) => ({ type: "symbol" as const, key: `s-${m.symbol}`, primary: m.symbol, secondary: m.name, href: `/research?symbol=${m.symbol}` })),
    ...pages.map((p) => ({ type: "page" as const, key: `p-${p.href}`, primary: p.label, secondary: p.group, href: p.href })),
  ];

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[active]; if (o) go(o.href); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
      <div className="glass-strong relative w-full max-w-xl overflow-hidden rounded-lg animate-scale-in"
        style={{ background: "var(--surface-solid)" }}>
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
          <Search size={17} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search a ticker or jump to a page…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded border border-hairline px-1.5 py-0.5 text-[10px] text-ink-faint">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-auto py-1">
          {options.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-faint">No matches.</li>
          )}
          {options.map((o, i) => (
            <li key={o.key}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(o.href)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                  i === active ? "bg-accent-soft text-ink" : "text-ink-dim hover:bg-surface"
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className={`font-medium ${o.type === "symbol" ? "font-mono text-accent" : "text-ink"}`}>{o.primary}</span>
                  {o.secondary && <span className="truncate text-xs text-ink-faint">{o.secondary}</span>}
                </span>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-ink-faint">
                  {o.type === "symbol" ? "Research" : "Go"}
                  {i === active && <CornerDownLeft size={11} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
