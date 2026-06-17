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
  Grid3x3,
} from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/holdings", label: "Holdings", icon: Wallet },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/research", label: "Research", icon: Search },
  { href: "/map", label: "Stock Map", icon: Grid3x3 },
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
    <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-y-0 border-l-0 p-4 md:block">
      {/* Wordmark */}
      <div className="flex items-center gap-3 px-2 pb-7 pt-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 shadow-[0_0_20px_-6px_rgba(212,168,42,0.4)]">
          <JasmineMark />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[19px] font-semibold tracking-tight text-shimmer">
            Noor Investing
          </div>
          <div className="text-[10px] font-medium tracking-[0.35em] text-brand-700 uppercase">Lab</div>
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
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-brand-500/10 font-medium text-brand-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                  : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100 hover:translate-x-0.5",
              )}
            >
              {/* active gold rail */}
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-300 to-brand-600 shadow-[0_0_10px_0_rgba(212,168,42,0.6)]" />
              )}
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

      <p className="mt-8 px-2 text-[10px] leading-relaxed text-slate-600">
        Research &amp; educational analysis.<br />Not financial advice.
      </p>
    </aside>
  );
}
