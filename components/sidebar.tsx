"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, Search } from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { Blossom } from "./ui/primitives";
import { AccountMenu } from "./account-menu";
import { TopSearch } from "./top-search";
import { useAlertsBadge } from "./use-alerts-badge";
import { useSidebarCollapsed } from "./use-sidebar";
import { OVERVIEW, SECTIONS, isPathActive } from "@/lib/nav";

// Desktop sidebar nav, driven by the four-section IA in lib/nav.ts:
// Overview · Invest (flagship) · Money · Insights. Admin tools live in the
// top-right account menu.
const GROUPS = [
  { label: "", items: [OVERVIEW] },
  ...SECTIONS.map((s) => ({ label: s.label, items: s.items })),
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const alertsNew = useAlertsBadge();
  // Admin tools now live in the top-right account menu, not the left nav.
  const groups = GROUPS;
  return (
    <nav className="space-y-5">
      {groups.map((group, gi) => {
        const items = group.items;
        if (!items.length) return null;
        return (
        <div key={group.label || `g${gi}`}>
          {group.label && <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{group.label}</div>}
          <div className="space-y-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const active = isPathActive(path ?? "/", href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={clsx(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                    active ? "font-semibold" : "text-ink-dim hover:text-ink hover:translate-x-0.5",
                  )}
                  style={active ? { background: "var(--nav-active)", color: "var(--nav-active-fg)", boxShadow: "var(--nav-active-glow)" } : undefined}
                >
                  <span className="relative">
                    <Icon size={16} className={clsx("transition-transform duration-200 group-hover:scale-110", !active && "text-ink-faint")} style={active ? { color: "var(--nav-active-fg)" } : undefined} />
                    {href === "/alerts" && alertsNew && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />
                    )}
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2 transition-opacity hover:opacity-80" title="Go to Dashboard">
      <Blossom className="h-10 w-10" />
      <div className="leading-tight">
        <div className="font-display text-[20px] font-bold tracking-tight">
          <span className="text-ink">ruk</span><span className="text-shimmer">Money</span>
        </div>
        <div className="text-[10px] font-medium tracking-[0.3em] uppercase text-ink-faint">AI Wealth</div>
      </div>
    </Link>
  );
}

function Footer() {
  return (
    <div className="mt-6 px-2">
      {/* Search lives in the top bar; sign out in the account menu — not duplicated here. */}
      <div className="flex items-center justify-end">
        <p className="text-[10px] leading-tight text-ink-faint">Research only.<br />Not advice.</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  // The mobile bottom tab bar's "More" button opens this drawer via a global event.
  useEffect(() => {
    const openNav = () => setOpen(true);
    window.addEventListener("open-nav", openNav);
    return () => window.removeEventListener("open-nav", openNav);
  }, []);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 md:hidden" style={{ background: "var(--surface-solid)" }}>
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="shrink-0 rounded-md border border-hairline p-2 text-ink-dim hover:text-ink">
              <Menu size={18} />
            </button>
            <Wordmark />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch((s) => !s)}
              aria-label="Search"
              className={`rounded-md border p-2 ${showSearch ? "border-brand-500/40 text-brand-300" : "border-hairline text-ink-dim hover:text-ink"}`}>
              <Search size={18} />
            </button>
            <ThemeToggle compact />
            <AccountMenu />
          </div>
        </div>
        {/* Inline search row — appears under the bar on demand; no modal. */}
        {showSearch && (
          <div className="border-b border-hairline px-4 py-2"><TopSearch /></div>
        )}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto p-4 animate-fade-in" style={{ background: "var(--surface-solid)" }}>
            <div className="mb-6 flex items-center justify-between">
              <Wordmark />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-md p-1.5 text-ink-dim hover:text-ink"><X size={18} /></button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
            <Footer />
          </aside>
        </div>
      )}

      {/* Desktop sidebar — stays mounted and animates its WIDTH (not unmount), so
          collapse/expand glides instead of snapping. Content reflows with no
          blur/overlay. Inner wrapper is fixed-width so text doesn't squish as the
          rail narrows; overflow-hidden clips it during the slide. */}
      <aside
        className={clsx(
          "sticky top-0 hidden h-screen shrink-0 overflow-hidden rounded-none border-y-0 border-l-0 transition-[width] duration-300 ease-in-out md:block",
          collapsed ? "w-0 border-r-0" : "glass w-64",
        )}
      >
        <div className="w-64 overflow-y-auto p-4" style={{ height: "100vh" }}>
          <div className="pb-7 pt-2"><Wordmark /></div>
          {/* Auto-collapse when a nav item is clicked, so the page gets full
              width. Reopen via the top-bar wordmark. */}
          <NavList onNavigate={() => setCollapsed(true)} />
          <Footer />
        </div>
      </aside>
    </>
  );
}
