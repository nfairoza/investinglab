"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Search, Bell, Menu } from "lucide-react";
import clsx from "clsx";
import { useAlertsBadge } from "./use-alerts-badge";

// Native-app-style bottom tab bar (phones only). Primary destinations live here;
// "More" opens the full slide-in drawer (Sidebar listens for the open-nav event).
const TABS = [
  { href: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/holdings", label: "Holdings", icon: Wallet },
  { href: "/research", label: "Research", icon: Search },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export function MobileTabBar() {
  const path = usePathname() || "/";
  const alertsNew = useAlertsBadge();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-hairline md:hidden"
      style={{
        background: "var(--surface-solid)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Primary"
    >
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-faint",
            )}
            style={active ? { color: "var(--accent)" } : undefined}
          >
            <span className="relative">
              <Icon size={20} />
              {href === "/alerts" && alertsNew && (
                <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 bg-rose-500" style={{ borderColor: "var(--surface-solid)" }} />
              )}
            </span>
            {label}
          </Link>
        );
      })}
      <button
        onClick={() => window.dispatchEvent(new Event("open-nav"))}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-ink-faint transition-colors"
        aria-label="More"
      >
        <Menu size={20} />
        More
      </button>
    </nav>
  );
}
