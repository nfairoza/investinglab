"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Wallet, Eye, Search, Stethoscope, TrendingUp, Landmark,
  Bell, BookOpen, Settings, Trophy, NotebookPen, Plug, Grid3x3, Menu, X, Command, LogOut,
} from "lucide-react";
import clsx from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { Blossom } from "./ui/primitives";

// Grouped nav so 14 sections scan easily.
const GROUPS: { label: string; items: { href: string; label: string; icon: any }[] }[] = [
  {
    label: "Portfolio",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/holdings", label: "Holdings", icon: Wallet },
      { href: "/watchlist", label: "Watchlist", icon: Eye },
      { href: "/journal", label: "Journal", icon: NotebookPen },
    ],
  },
  {
    label: "Research",
    items: [
      { href: "/research", label: "Research", icon: Search },
      { href: "/map", label: "Stock Map", icon: Grid3x3 },
      { href: "/rankings", label: "Rankings", icon: Trophy },
      { href: "/portfolio-doctor", label: "Portfolio Doctor", icon: Stethoscope },
      { href: "/predictions", label: "Predictions", icon: TrendingUp },
      { href: "/congress", label: "Congress", icon: Landmark },
    ],
  },
  {
    label: "Alerts",
    items: [{ href: "/alerts", label: "Alerts", icon: Bell }],
  },
  {
    label: "Setup",
    items: [
      { href: "/connectors", label: "Connectors", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/glossary", label: "Glossary", icon: BookOpen },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{group.label}</div>
          <div className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
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
                  <Icon size={16} className={clsx("transition-transform duration-200 group-hover:scale-110", !active && "text-ink-faint")} style={active ? { color: "var(--nav-active-fg)" } : undefined} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2 transition-opacity hover:opacity-80" title="Go to Dashboard">
      <div className="flex h-10 w-10 items-center justify-center rounded-md border" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)" }}>
        <Blossom className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-display text-[19px] font-semibold tracking-tight text-shimmer">Noor Investing</div>
        <div className="text-[10px] font-medium tracking-[0.35em] uppercase text-ink-faint">Lab</div>
      </div>
    </Link>
  );
}

function Footer() {
  return (
    <div className="mt-6 space-y-3 px-2">
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="flex w-full items-center justify-between rounded-md border border-hairline px-3 py-2 text-xs text-ink-dim hover:bg-surface"
      >
        <span className="flex items-center gap-2"><Command size={13} /> Quick search</span>
        <kbd className="rounded border border-hairline px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>
      {/* Sign out — posts to the auth signout route, clears the session. */}
      <form action="/auth/signout" method="post">
        <button type="submit"
          className="flex w-full items-center gap-2 rounded-md border border-hairline px-3 py-2 text-xs text-ink-dim hover:bg-surface hover:text-ink">
          <LogOut size={13} /> Sign out
        </button>
      </form>
      <div className="flex items-center justify-between">
        <ThemeToggle />
        <p className="text-[10px] leading-tight text-ink-faint">Research only.<br />Not advice.</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-hairline px-4 py-3 md:hidden" style={{ background: "var(--surface-solid)" }}>
        <Wordmark />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md border border-hairline p-2 text-ink-dim hover:text-ink">
          <Menu size={18} />
        </button>
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

      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-4 md:block">
        <div className="pb-7 pt-2"><Wordmark /></div>
        <NavList />
        <Footer />
      </aside>
    </>
  );
}
