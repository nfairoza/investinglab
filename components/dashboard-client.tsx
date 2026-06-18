"use client";

import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, Sparkles, Eye } from "lucide-react";
import type { Holding, WatchItem } from "@/lib/db";
import { DataBadge, DataTimestamp } from "./data-state";
import { AllocationDonut } from "./charts/AllocationDonut";
import { GainLossBar } from "./charts/GainLossBar";
import { QuoteProbe } from "./quote-probe";
import { Hero } from "./hero";
import { GlassCard, EmptyState, Button, ScrollReveal } from "./ui/primitives";
import type { DataResult, Quote } from "@/lib/providers/types";

async function fetchQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(`/api/quote?symbol=${s}`);
        return [s, (await r.json()) as DataResult<Quote>] as const;
      } catch {
        return [s, { data: null, source: "unavailable", asOf: null, provider: "client", note: "failed" } as DataResult<Quote>] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}

export function DashboardClient() {
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings", fetchJson, { revalidateOnFocus: true });
  const { data: watchlist = [] } = useSWR<WatchItem[]>("/api/watchlist", fetchJson, { revalidateOnFocus: true });

  const symbols = holdings.map((h) => h.symbol);
  const { data: quotes } = useSWR(
    symbols.length ? ["dash-quotes", symbols.join(",")] : null,
    () => fetchQuotes(symbols),
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true },
  );

  const valued = holdings.map((h) => {
    const q = quotes?.[h.symbol]?.data ?? null;
    const price = q?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gain = value != null ? value - cost : null;
    const gainPct = value != null && cost > 0 ? (gain! / cost) * 100 : null;
    return { h, price, value, gain, gainPct };
  });

  const total = valued.reduce((sum, v) => sum + (v.value ?? 0), 0);
  const totalCost = valued.reduce((sum, v) => sum + v.h.avgCost * v.h.shares, 0);
  const totalGain = total > 0 && totalCost > 0 ? total - totalCost : null;
  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;

  const slices = valued.filter((v) => v.value != null && total > 0).map((v) => ({ symbol: v.h.symbol, value: (v.value! / total) * 100 }));
  const gainLossRows = valued.filter((v) => v.gain != null && v.gainPct != null).map((v) => ({ symbol: v.h.symbol, gain: v.gain!, gainPct: v.gainPct! }));
  const winners = [...gainLossRows].sort((a, b) => b.gain - a.gain).slice(0, 4);
  const losers = [...gainLossRows].sort((a, b) => a.gain - b.gain).slice(0, 4);
  const hasHoldings = holdings.length > 0;

  const firstLook = !hasHoldings
    ? null
    : totalGain != null && totalGain < 0
      ? `Your portfolio is down $${Math.abs(totalGain).toFixed(0)} overall — check which holdings are dragging it.`
      : slices.some((s) => s.value > 40)
        ? "One stock is over 40% of your portfolio — are you comfortable with that concentration?"
        : "Portfolio looks healthy. Scan the gain/loss tile for positions worth trimming or adding.";

  return (
    <div className="space-y-6">
      <Hero total={total} totalGain={totalGain} badge={anySource ? <DataBadge source={anySource} /> : undefined} />

      {!hasHoldings && (
        <EmptyState
          title="Your dashboard is waiting for its first holding"
          hint="Add positions in Holdings — or sync E*TRADE / Robinhood — and this dashboard fills with your live value, allocation, and gain/loss."
          action={<Link href="/holdings"><Button variant="gold">Add holdings</Button></Link>}
        />
      )}

      {hasHoldings && (
        <ScrollReveal>
          {/* What to look at first */}
          {firstLook && (
            <div className="mb-5 rounded-md border px-4 py-3 text-sm" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)", color: "var(--text)" }}>
              <span className="font-semibold text-accent">What to look at first — </span>
              <span className="text-ink-dim">{firstLook}</span>
            </div>
          )}

          {/* Bento grid */}
          <div className="grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 lg:grid-cols-6">
            {/* Allocation — wide */}
            <GlassCard hover className="lg:col-span-4">
              <AllocationDonut slices={slices} />
            </GlassCard>

            {/* Stat stack */}
            <div className="grid gap-4 lg:col-span-2">
              <StatTile label="Total gain / loss"
                value={totalGain != null ? `${totalGain >= 0 ? "▲" : "▼"} $${Math.abs(totalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                tone={totalGain == null ? "neutral" : totalGain >= 0 ? "positive" : "negative"} />
              <StatTile label="Holdings" value={`${holdings.length}`} href="/holdings" hrefLabel="Manage" />
              <StatTile label="Watchlist" value={`${watchlist.length}`} href="/watchlist" hrefLabel="View" icon={<Eye size={14} />} />
            </div>

            {/* Gain/loss — wide */}
            <GlassCard hover className="lg:col-span-4">
              <GainLossBar holdings={gainLossRows} />
            </GlassCard>

            {/* Winners / losers stacked */}
            <div className="grid gap-4 lg:col-span-2">
              <RankCard title="Top movers up" rows={winners} positive />
              <RankCard title="Top movers down" rows={losers} positive={false} />
            </div>
          </div>

          {quotes && <div className="mt-3"><DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} /></div>}
        </ScrollReveal>
      )}

      {/* Market overview */}
      <ScrollReveal>
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <h2 className="text-sm font-medium text-ink-dim">Market overview</h2>
        </div>
        <p className="mb-3 mt-0.5 text-[11px] text-ink-faint">A quick read on the overall market: the S&amp;P 500, big tech, and the fear gauge.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuoteProbe symbol="SPY" label="S&P 500 (SPY)" hint="The 500 largest US companies — the broad market." />
          <QuoteProbe symbol="QQQ" label="Nasdaq-100 (QQQ)" hint="The 100 biggest non-financial tech-heavy names." />
          <QuoteProbe symbol="^VIX" label="VIX — fear gauge" hint="Expected 30-day volatility. Higher = more fear; spikes on selloffs." />
        </div>
      </ScrollReveal>

      <p className="text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}

function StatTile({ label, value, tone = "neutral", href, hrefLabel, icon }: {
  label: string; value: string; tone?: "neutral" | "positive" | "negative"; href?: string; hrefLabel?: string; icon?: React.ReactNode;
}) {
  const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : "var(--text)";
  return (
    <GlassCard hover className="flex flex-col justify-between">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-ink-faint">
        <span>{label}</span>{icon}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tnum" style={{ color }}>{value}</div>
      {href && <Link href={href} className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">{hrefLabel} <ArrowUpRight size={12} /></Link>}
    </GlassCard>
  );
}

function RankCard({ title, rows, positive }: { title: string; rows: { symbol: string; gain: number; gainPct: number }[]; positive: boolean }) {
  return (
    <GlassCard hover>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">No data.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.symbol} className="flex items-center justify-between text-sm">
              <Link href={`/holdings/${r.symbol}`} className="font-mono font-medium text-accent hover:underline">{r.symbol}</Link>
              <span className="font-mono tnum text-xs" style={{ color: positive ? "var(--positive)" : "var(--negative)" }}>
                {r.gain >= 0 ? "▲" : "▼"} ${Math.abs(r.gain).toFixed(0)} ({r.gainPct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
