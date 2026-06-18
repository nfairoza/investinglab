"use client";

import useSWR from "swr";
import type { Holding, WatchItem } from "@/lib/db";
import { DataBadge, DataTimestamp } from "./data-state";
import { AllocationDonut } from "./charts/AllocationDonut";
import { GainLossBar } from "./charts/GainLossBar";
import { QuoteProbe } from "./quote-probe";
import type { DataResult, Quote } from "@/lib/providers/types";
import Link from "next/link";

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
    const gainPct = value != null && cost > 0 ? ((gain!) / cost) * 100 : null;
    return { h, price, value, gain, gainPct };
  });

  const total = valued.reduce((sum, v) => sum + (v.value ?? 0), 0);
  const totalCost = valued.reduce((sum, v) => sum + v.h.avgCost * v.h.shares, 0);
  const totalGain = total > 0 && totalCost > 0 ? total - totalCost : null;
  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;

  const slices = valued
    .filter((v) => v.value != null && total > 0)
    .map((v) => ({ symbol: v.h.symbol, value: (v.value! / total) * 100 }));

  const gainLossRows = valued
    .filter((v) => v.gain != null && v.gainPct != null)
    .map((v) => ({ symbol: v.h.symbol, gain: v.gain!, gainPct: v.gainPct! }));

  const winners = [...gainLossRows].sort((a, b) => b.gain - a.gain).slice(0, 5);
  const losers = [...gainLossRows].sort((a, b) => a.gain - b.gain).slice(0, 5);

  const hasHoldings = holdings.length > 0;

  return (
    <div className="space-y-6">
      {/* What to look at first */}
      {hasHoldings && total > 0 ? (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-brand-100">
          <span className="font-semibold">What should I look at first?</span>{" "}
          {totalGain != null && totalGain < 0
            ? `Your portfolio is down $${Math.abs(totalGain).toFixed(0)} overall — check which holdings are dragging it and review their thesis.`
            : slices.some((s) => s.value > 40)
              ? `One stock is over 40% of your portfolio — are you comfortable with that concentration?`
              : `Portfolio looks healthy. Check the gain/loss chart for any positions worth trimming or adding to.`}
        </div>
      ) : (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-brand-100">
          <span className="font-semibold">What should I look at first?</span>{" "}
          Add holdings in the <Link href="/holdings" className="underline">Holdings tab</Link> — then this dashboard will show your portfolio value, allocation, and gain/loss in real time.
        </div>
      )}

      {/* Portfolio summary */}
      {hasHoldings && (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Portfolio value"
            value={total > 0 ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            sub={anySource ? <DataBadge source={anySource} /> : undefined}
          />
          <SummaryCard
            label="Total gain / loss"
            value={
              totalGain != null
                ? `${totalGain >= 0 ? "▲ up" : "▼ down"} $${Math.abs(totalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : "—"
            }
            valueClass={totalGain == null ? "" : totalGain >= 0 ? "text-emerald-300" : "text-rose-300"}
          />
          <SummaryCard label="Holdings" value={`${holdings.length} position${holdings.length !== 1 ? "s" : ""}`}
            sub={<Link href="/holdings" className="text-xs text-brand-400 underline">Manage</Link>} />
        </div>
      )}

      {/* Charts: allocation + gain/loss */}
      {hasHoldings && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AllocationDonut slices={slices} />
          <GainLossBar holdings={gainLossRows} />
        </div>
      )}

      {/* Top winners / losers */}
      {gainLossRows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RankCard title="Top winners" rows={winners} positive />
          <RankCard title="Top losers" rows={losers} positive={false} />
        </div>
      )}

      {/* Timestamps */}
      {quotes && (
        <div>
          <DataTimestamp asOf={Object.values(quotes)[0]?.asOf ?? null} />
        </div>
      )}

      {/* Market overview — the three gauges traders glance at first:
          SPY = the whole US large-cap market (S&P 500), QQQ = big tech (Nasdaq-100),
          VIX = the market's "fear gauge" (expected volatility; high = nervous). */}
      <div>
        <h2 className="mb-1 text-sm font-medium text-slate-300">Market overview</h2>
        <p className="mb-3 text-[11px] text-slate-500">
          A quick read on the overall market: the S&amp;P 500, big tech, and the fear gauge.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuoteProbe symbol="SPY" label="S&P 500 (SPY)" hint="The 500 largest US companies — the broad market." />
          <QuoteProbe symbol="QQQ" label="Nasdaq-100 (QQQ)" hint="The 100 biggest non-financial tech-heavy names." />
          <QuoteProbe symbol="^VIX" label="VIX — fear gauge" hint="Expected 30-day volatility. Higher = more fear; spikes on selloffs." />
        </div>
      </div>

      {/* Watchlist count */}
      {watchlist.length > 0 && (
        <div className="rounded-lg border border-white/5 bg-black/20 p-3 text-sm text-slate-400">
          You have <span className="text-slate-200">{watchlist.length}</span> stocks on your{" "}
          <Link href="/watchlist" className="text-brand-400 underline">watchlist</Link>.
        </div>
      )}

      <p className="text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}

function SummaryCard({
  label, value, sub, valueClass = "text-slate-100",
}: {
  label: string; value: string; sub?: React.ReactNode; valueClass?: string;
}) {
  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${valueClass}`}>{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function RankCard({
  title, rows, positive,
}: {
  title: string;
  rows: { symbol: string; gain: number; gainPct: number }[];
  positive: boolean;
}) {
  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No data.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.symbol} className="flex items-center justify-between text-sm">
              <Link href={`/holdings/${r.symbol}`} className="font-medium text-brand-300 hover:underline">
                {r.symbol}
              </Link>
              <span className={positive ? "text-emerald-400" : "text-rose-400"}>
                {r.gain >= 0 ? "▲" : "▼"} ${Math.abs(r.gain).toFixed(0)} ({r.gainPct.toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
