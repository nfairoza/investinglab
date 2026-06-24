"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, TrendingUp, Scale, Search, Plus } from "lucide-react";
import clsx from "clsx";

// Bottom tab bar (phones only): Overview · Invest · + · Money · Research.
// AI-forward: Research gets a primary slot. Invest sits left-of-center; "+" is
// the central action button (opens the global add sheet), not a route.
// Insights/Alerts remain in the sidebar + Invest/Money sub-navs.
const TABS = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true, match: ["/"] },
  { href: "/holdings", label: "Invest", icon: TrendingUp, match: ["/holdings", "/watchlist", "/journal", "/rankings", "/map", "/predictions", "/portfolio-doctor", "/congress"] },
  // index 2 = the "+" action button (rendered specially)
  { href: "/networth", label: "Money", icon: Scale, match: ["/networth", "/accounts", "/transactions", "/spending", "/advisor", "/alerts"] },
  { href: "/research", label: "Research", icon: Search, match: ["/research"] },
];

export function MobileTabBar() {
  const path = usePathname() || "/";

  const isActive = (t: typeof TABS[number]) =>
    t.exact ? path === t.href : t.match.some((m) => path.startsWith(m));

  const Tab = (t: typeof TABS[number]) => {
    const active = isActive(t);
    const Icon = t.icon;
    return (
      <Link key={t.href} href={t.href}
        className={clsx("flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors", active ? "text-ink" : "text-ink-faint")}
        style={active ? { color: "var(--accent)" } : undefined}>
        <span className="relative"><Icon size={20} /></span>
        {t.label}
      </Link>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-hairline md:hidden"
      style={{ background: "var(--surface-solid)", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {Tab(TABS[0])}
      {Tab(TABS[1])}

      {/* Central + action — opens the global connect/add sheet. */}
      <button
        onClick={() => window.dispatchEvent(new Event("open-add"))}
        aria-label="Add or connect"
        className="flex flex-1 flex-col items-center justify-center py-1.5"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg" style={{ background: "var(--nav-active)" }}>
          <Plus size={22} />
        </span>
      </button>

      {Tab(TABS[2])}
      {Tab(TABS[3])}
    </nav>
  );
}
