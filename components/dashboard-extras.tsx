"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, Bell, NotebookPen, Sparkles } from "lucide-react";
import { GlowSparkline } from "./charts/GlowSparkline";
import type { DataResult, PriceHistory } from "@/lib/providers/types";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

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
  // Everything on this card describes TODAY (1-day). Fetch the intraday (5-min)
  // series so the sparkline shows today's path; the badge %, line color, and $
  // change all derive from today's previous-close → now move so they agree.
  const { data: intraday } = useSWR<DataResult<PriceHistory>>(
    `/api/price-history?symbol=${symbol}&range=1D`,
    fetchJson,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );
  const intradaySeries = (intraday?.data?.points ?? []).map((p) => ({ v: p.close }));
  // Prepend the previous close so the line (and its up/down color) measures the
  // SAME thing as the badge: previous-close → now, including the opening gap.
  const prevClose = dayPct != null && price != null ? price / (1 + dayPct / 100) : null;
  const sparkSeries = intradaySeries.length >= 2
    ? (prevClose != null ? [{ v: prevClose }, ...intradaySeries] : intradaySeries)
    : series.slice(-2);
  const dayUp = (dayPct ?? 0) >= 0;
  // Today's $ change for this position = today's % move × current value.
  const dayChange = dayPct != null && price != null && shares ? (price * shares) * (dayPct / 100) : null;
  return (
    <Link href={`/research?symbol=${symbol}`}
      className="card-hover group relative block overflow-hidden rounded-md border border-hairline p-3 sm:p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ink sm:text-base">{symbol}</span>
            <ArrowUpRight size={14} className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          {name && <div className="hidden truncate text-[11px] text-ink-faint sm:block">{name}</div>}
        </div>
        {dayPct != null && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium sm:text-xs"
            style={{ color: dayUp ? "var(--positive)" : "var(--negative)", background: dayUp ? "var(--positive-soft)" : "var(--negative-soft)" }}>
            {dayUp ? "▲" : "▼"} {Math.abs(dayPct).toFixed(2)}% <span className="opacity-60">1D</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 font-mono text-lg font-semibold tnum text-ink sm:mt-2 sm:text-2xl">{price != null ? `$${price.toFixed(2)}` : "—"}</div>
      {/* Glow sparkline — today's intraday path (shorter on phones) */}
      <div className="relative mt-1.5 -mx-3 -mb-3 sm:mt-2 sm:-mx-4 sm:-mb-4">
        <div className="sm:hidden"><GlowSparkline data={sparkSeries} height={40} /></div>
        <div className="hidden sm:block"><GlowSparkline data={sparkSeries} height={88} /></div>
        {dayChange != null && Math.abs(dayChange) >= 1 && (
          <span className="absolute right-3 top-1 rounded-md border border-hairline px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: "var(--surface-solid)", color: dayChange >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {dayChange >= 0 ? "+" : "−"}${Math.abs(dayChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
