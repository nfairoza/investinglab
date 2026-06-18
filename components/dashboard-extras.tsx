"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, NotebookPen, Sparkles } from "lucide-react";
import { GlowSparkline } from "./charts/GlowSparkline";

// ── Gradient stat tile (Logip/Kristin look) ─────────────────────────────────
// Subtle theme-tinted gradient; one headline metric + sublabel.
export function GradientStat({
  label, value, sub, tone = "emerald", icon,
}: { label: string; value: string; sub?: string; tone?: "emerald" | "rose" | "violet" | "amber"; icon?: React.ReactNode }) {
  const grad: Record<string, string> = {
    emerald: "linear-gradient(135deg, color-mix(in oklab, var(--positive) 22%, transparent), transparent 70%)",
    rose: "linear-gradient(135deg, color-mix(in oklab, var(--negative) 20%, transparent), transparent 70%)",
    violet: "linear-gradient(135deg, color-mix(in oklab, #8B7CF6 22%, transparent), transparent 70%)",
    amber: "linear-gradient(135deg, color-mix(in oklab, #E0B341 22%, transparent), transparent 70%)",
  };
  return (
    <div className="card-hover relative overflow-hidden rounded-md border border-hairline p-4" style={{ background: "var(--surface)" }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: grad[tone] }} aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-ink-faint">
          <span>{label}</span>{icon}
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold tnum text-ink">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-ink-dim">{sub}</div>}
      </div>
    </div>
  );
}

// ── Asset KPI card: big glow sparkline + peak callout (Stakent 'Top Assets') ──
export function AssetCard({
  symbol, name, price, dayPct, series, shares,
}: { symbol: string; name?: string; price: number | null; dayPct: number | null; series: { v: number }[]; shares?: number }) {
  const up = (dayPct ?? 0) >= 0;
  // Period $ change of this position over the sparkline window (close × shares).
  const first = series[0]?.v;
  const last = series[series.length - 1]?.v;
  const periodChange = first != null && last != null && shares ? (last - first) * shares : null;
  return (
    <Link href={`/research?symbol=${symbol}`}
      className="card-hover group relative block overflow-hidden rounded-md border border-hairline p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-ink">{symbol}</span>
            <ArrowUpRight size={14} className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          {name && <div className="truncate text-[11px] text-ink-faint">{name}</div>}
        </div>
        {dayPct != null && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium"
            style={{ color: up ? "var(--positive)" : "var(--negative)", background: up ? "var(--positive-soft)" : "var(--negative-soft)" }}>
            {up ? "▲" : "▼"} {Math.abs(dayPct).toFixed(2)}%
          </span>
        )}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tnum text-ink">{price != null ? `$${price.toFixed(2)}` : "—"}</div>
      {/* Big glow sparkline fills the card bottom */}
      <div className="relative mt-2 -mx-4 -mb-4">
        <GlowSparkline data={series} height={88} />
        {periodChange != null && Math.abs(periodChange) >= 1 && (
          <span className="absolute right-3 top-1 rounded-md border border-hairline px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: "var(--surface-solid)", color: periodChange >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {periodChange >= 0 ? "+" : "−"}${Math.abs(periodChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
    </Link>
  );
}

// ── Right-rail activity panel ────────────────────────────────────────────────
export interface ActivityItem { kind: "trade" | "alert" | "prediction"; symbol: string; text: string; when?: string; href: string; }

const KIND_ICON = {
  trade: NotebookPen,
  alert: Bell,
  prediction: Sparkles,
};

export function ActivityRail({ items }: { items: ActivityItem[] }) {
  return (
    <div className="glass p-5">
      <div className="text-sm font-semibold text-ink">Recent activity</div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">Nothing yet — log a trade in the Journal or set an alert.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((it, i) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <li key={i}>
                <Link href={it.href} className="flex items-start gap-3 rounded-md p-1.5 -m-1.5 hover:bg-surface">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline" style={{ color: "var(--accent)", background: "var(--accent-soft)" }}>
                    <Icon size={13} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-medium text-ink">{it.symbol}</span>
                      {it.when && <span className="text-[11px] text-ink-faint">{it.when}</span>}
                    </div>
                    <p className="truncate text-xs text-ink-dim">{it.text}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
