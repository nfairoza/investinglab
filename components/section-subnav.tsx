"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { sectionForPath } from "@/lib/nav";

// Sub-navigation for the active section (Invest gets the richest one). Shown
// under the top bar; horizontally scrollable on phones so every sub-area is one
// tap away without a second bar.
export function SectionSubnav() {
  const path = usePathname() || "/";
  const section = sectionForPath(path);
  // Only show a sub-nav for sections with real internal structure (Invest, Money).
  if (!section || section.items.length < 2) return null;

  return (
    <div className="border-b border-hairline bg-[color:var(--bg)]/60">
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap px-5 py-2 md:px-10 [&::-webkit-scrollbar]:hidden">
        {section.items.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== "/" && path.startsWith(href));
          return (
            <Link key={href} href={href}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "tab-active" : "text-ink-dim hover:bg-surface hover:text-ink",
              )}>
              <Icon size={13} /> {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
