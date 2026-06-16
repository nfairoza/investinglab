"use client";

import useSWR from "swr";
import { DataBadge } from "./data-state";
import type { DataResult } from "@/lib/providers/types";
import type { StockScore, Horizon } from "@/lib/scoring/score";
import type { Holding, WatchItem } from "@/lib/db";

// A starter universe to rank when you have few holdings. Full US-universe
// ranking needs FMP screener/bulk endpoints + a cache (the PostgreSQL "memory"
// role) — see the note at the bottom. This list + your tracked tickers is enough
// to demonstrate the rankings end to end.
const SEED = [
  "AAPL", "MSFT", "NVDA", "AMD", "GOOGL", "AMZN", "META", "TSLA",
  "AVGO", "JPM", "V", "COST", "NFLX", "CRM", "ADBE", "QCOM",
];

async function scoreAll(symbols: string[]): Promise<StockScore[]> {
  const results = await Promise.all(
    symbols.map(async (s) => {
      try {
        const r = await fetch(`/api/score?symbol=${s}`);
        const d = (await r.json()) as DataResult<StockScore>;
        return d.data;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((x): x is StockScore => x != null);
}

function topBy(scores: StockScore[], h: Horizon, n = 10): StockScore[] {
  return scores
    .filter((s) => s.horizons[h] != null)
    .sort((a, b) => (b.horizons[h]! - a.horizons[h]!))
    .slice(0, n);
}

function ScoreList({ title, subtitle, rows, horizon }: { title: string; subtitle: string; rows: StockScore[]; horizon: Horizon }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
      <ol className="mt-3 space-y-1">
        {rows.length === 0 && <li className="text-sm text-slate-500">No data.</li>}
        {rows.map((s, i) => (
          <li key={s.symbol} className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-slate-600">{i + 1}</span>
            <a href={`/research?symbol=${s.symbol}`} className="w-16 shrink-0 font-medium text-brand-300 hover:underline">{s.symbol}</a>
            <span className="w-10 shrink-0 text-slate-200">{Math.round(s.horizons[horizon] ?? 0)}</span>
            <span className="truncate text-xs text-slate-500">
              {s.earningsInDays != null && s.earningsInDays <= 7 ? `⚠ earnings ${s.earningsInDays}d` : s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Rankings() {
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings", (url: string) => fetch(url).then((r) => r.json()));
  const { data: watch = [] } = useSWR<WatchItem[]>("/api/watchlist", (url: string) => fetch(url).then((r) => r.json()));

  const owned = new Set(holdings.map((h) => h.symbol));
  const universe = Array.from(new Set([...SEED, ...holdings.map((h) => h.symbol), ...watch.map((w) => w.symbol)]));

  const { data: scores, isLoading } = useSWR(["rankings", universe.join(",")], () => scoreAll(universe), {
    refreshInterval: 5 * 60_000,
    keepPreviousData: true,
  });

  if (isLoading && !scores) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-800" />;
  }
  const all = scores ?? [];
  const source = all.length ? "demo" : undefined; // demo until a key is set; per-row source is uniform

  // Avoid this week: imminent earnings or weak 1-week score.
  const avoid = all
    .filter((s) => (s.earningsInDays != null && s.earningsInDays <= 7) || (s.horizons["1W"] ?? 100) < 35)
    .sort((a, b) => (a.horizons["1W"] ?? 0) - (b.horizons["1W"] ?? 0))
    .slice(0, 10);

  // Portfolio warnings for owned names.
  const portfolio = all
    .filter((s) => owned.has(s.symbol))
    .map((s) => {
      let flag = "Hold";
      if (s.earningsInDays != null && s.earningsInDays <= 7) flag = `Watch — earnings in ${s.earningsInDays}d`;
      else if (s.overall < 40) flag = "Trim / watch — weak score";
      else if (s.overall >= 70) flag = "Add candidate — strong score";
      return { s, flag };
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Universe: {all.length} stocks (seed + your tracked tickers)</span>
        {source && <DataBadge source="demo" />}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ScoreList title="Top 10 — 1 week momentum" subtitle="Best short-term momentum + trend" rows={topBy(all, "1W")} horizon="1W" />
        <ScoreList title="Top 10 — 1 month swing" subtitle="Trend + momentum + near-term growth" rows={topBy(all, "1M")} horizon="1M" />
        <ScoreList title="Top 10 — undervalued growth (1 year)" subtitle="Valuation + revenue growth + margins" rows={topBy(all, "1Y")} horizon="1Y" />
        <ScoreList title="Top 10 — compounder candidates (5 years)" subtitle="Durable growth + margins + cash flow" rows={topBy(all, "5Y")} horizon="5Y" />
      </div>

      {/* Avoid this week */}
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
        <div className="text-sm font-semibold text-rose-200">Avoid this week (earnings / momentum risk)</div>
        <ol className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {avoid.length === 0 && <li className="text-sm text-slate-500">Nothing flagged.</li>}
          {avoid.map((s) => (
            <li key={s.symbol} className="flex items-center gap-3 text-sm">
              <a href={`/research?symbol=${s.symbol}`} className="w-16 shrink-0 font-medium text-brand-300 hover:underline">{s.symbol}</a>
              <span className="truncate text-xs text-rose-300/90">{s.majorRisk}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Portfolio warnings */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-sm font-semibold text-slate-100">Your portfolio — hold / add / trim / watch</div>
        {portfolio.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Add holdings to see per-position guidance here.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {portfolio.map(({ s, flag }) => (
              <li key={s.symbol} className="flex items-center gap-3 text-sm">
                <a href={`/research?symbol=${s.symbol}`} className="w-16 shrink-0 font-medium text-brand-300 hover:underline">{s.symbol}</a>
                <span className="w-10 shrink-0 text-slate-300">{Math.round(s.overall)}</span>
                <span className="text-xs text-slate-400">{flag}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-600">
        Ranking the full US market needs a screener/bulk data source (paid FMP) plus a cache for
        history — wire that in Claude Code; this view ranks a seed list + your tracked tickers.
        Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
