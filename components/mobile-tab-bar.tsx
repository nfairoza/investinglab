"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { MOBILE_TABS } from "@/lib/nav";

// Bottom tab bar (phones only): the 5 primary IA destinations —
// Home · Portfolio · Research · Power · Money. Sourced from lib/nav MOBILE_TABS
// so it can't drift from the sidebar. Each tab owns its section's sub-tab routes
// (see `match`). ≥44px hit targets. The global "+ Add" action moved to the top
// bar / AddSheet; sub-tabs live in the section sub-nav.
export function MobileTabBar() {
  const path = usePathname() || "/";
  const isActive = (t: typeof MOBILE_TABS[number]) =>
    t.exact ? path === t.href : t.match.some((m) => path === m || path.startsWith(m + "/"));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-hairline md:hidden"
      style={{ background: "var(--surface-solid)", paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {MOBILE_TABS.map((t) => {
        const active = isActive(t);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-faint",
            )}
            style={active ? { color: "var(--accent)" } : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
