"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ShieldAlert, AlertTriangle, Plug } from "lucide-react";
import { isPathActive } from "@/lib/nav";

// Sub-navigation for the Admin Portal. Add new admin sections here.
const ITEMS = [
  { href: "/admin", label: "Overview", icon: ShieldAlert, exact: true },
  { href: "/admin/errors", label: "Error log", icon: AlertTriangle },
  { href: "/connectors", label: "Connectors & Keys", icon: Plug },
];

export function AdminNav() {
  const path = usePathname() || "/admin";
  return (
    <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [&>a]:shrink-0">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : isPathActive(path, href);
        return (
          <Link key={href} href={href}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface hover:text-ink",
            )}>
            <Icon size={14} /> {label}
          </Link>
        );
      })}
    </div>
  );
}
