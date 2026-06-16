"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Eye,
  Search,
  Stethoscope,
  TrendingUp,
  Landmark,
  Bell,
  BookOpen,
  Settings,
  Trophy,
  NotebookPen,
  Plug,
} from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/holdings", label: "Holdings", icon: Wallet },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/research", label: "Research", icon: Search },
  { href: "/rankings", label: "Rankings", icon: Trophy },
  { href: "/portfolio-doctor", label: "Portfolio Doctor", icon: Stethoscope },
  { href: "/predictions", label: "Predictions", icon: TrendingUp },
  { href: "/congress", label: "Congress", icon: Landmark },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/glossary", label: "Glossary", icon: BookOpen },
  { href: "/connectors", label: "Connectors", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Minimal jasmine blossom SVG mark — gently floats
function JasmineMark() {
  return (
    <svg
      width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden
      style={{ animation: "floatPetal 4s ease-in-out infinite" }}
    >
      {/* Five petals */}
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx="11" cy="11"
          rx="2.2" ry="5.5"
          fill="#d4a82a"
          opacity="0.85"
          transform={`rotate(${deg} 11 11)`}
        />
      ))}
      {/* Centre dot */}
      <circle cx="11" cy="11" r="2" fill="#f9f0c4" />
    </svg>
  );
}

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#1e2a1a] p-4 md:block">
      {/* Wordmark */}
      <div className="flex items-center gap-2.5 px-2 pb-6 pt-1">
        <JasmineMark />
        <div>
          <div className="font-display text-[15px] font-semibold tracking-tight text-[#f2e090]">
            Noor Investing
          </div>
          <div className="text-[10px] tracking-widest text-[#8f6a10] uppercase">Lab</div>
        </div>
      </div>

      <nav className="space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                active
                  ? "bg-brand-500/10 text-brand-300 font-medium"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 hover:translate-x-0.5",
              )}
            >
              <Icon
                size={16}
                className={clsx(
                  "transition-transform duration-200 group-hover:scale-110",
                  active ? "text-brand-400" : "",
                )}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <p className="mt-8 px-2 text-[10px] leading-relaxed text-slate-700">
        Research &amp; educational analysis.<br />Not financial advice.
      </p>
    </aside>
  );
}
