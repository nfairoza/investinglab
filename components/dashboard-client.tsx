"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Eye, TrendingUp, AlertTriangle } from "lucide-react";
import type { Holding, WatchItem, JournalEntry } from "@/lib/db";
import type { DataResult, Quote, PriceHistory } from "@/lib/providers/types";
import type { StockScore } from "@/lib/scoring/score";
import { DataBadge } from "./data-state";
import { QuoteProbe } from "./quote-probe";
import { Sparkline } from "./charts/Sparkline";
import { ScoreGauge } from "./charts/ScoreGauge";
import { GlassCard, EmptyState, Button, CountUp } from "./ui/primitives";
import { GradientStat, AssetCard, ActivityRail, type ActivityItem } from "./dashboard-extras";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return r.json();
}
async function fetchQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  const entries = await Promise.all(symbols.map(async (s) => {
    try { return [s, (await fetch(`/api/quote?symbol=${s}`).then((r) => r.json())) as DataResult<Quote>] as const; }
    catch { return [s, { data: null, source: "unavailable", asOf: null, provider: "client" } as DataResult<Quote>] as const; }
  }));
  return Object.fromEntries(entries);
}
async function fetchHistories(symbols: string[]): Promise<Record<string, { date: string; close: number }[]>> {
  const entries = await Promise.all(symbols.map(async (s) => {
    try { const d = (await fetch(`/api/price-history?symbol=${s}`).then((r) => r.json())) as DataResult<PriceHistory>; return [s, (d.data?.points ?? [])] as const; }
    catch { return [s, []] as const; }
  }));
  return Object.fromEntries(entries);
}

const RANGES = [{ k: "1M", d: 22 }, { k: "3M", d: 66 }, { k: "1Y", d: 252 }, { k: "ALL", d: 100000 }] as const;

export function DashboardClient() {
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings", fetchJson, { revalidateOnFocus: true });
  const { data: watchlist = [] } = useSWR<WatchItem[]>("/api/watchlist", fetchJson, { revalidateOnFocus: true });
  const { data: journal = [] } = useSWR<JournalEntry[]>("/api/journal", fetchJson);
  const [range, setRange] = useState<string>("1M");

  const symbols = holdings.map((h) => h.symbol);
  const { data: quotes } = useSWR(symbols.length ? ["dash-quotes", symbols.join(",")] : null, () => fetchQuotes(symbols),
    { refreshInterval: 60_000, keepPreviousData: true });
  const { data: histories = {} } = useSWR(symbols.length ? ["dash-hist", symbols.join(",")] : null, () => fetchHistories(symbols),
    { keepPreviousData: true });

  const topSym = [...holdings].sort((a, b) => b.avgCost * b.shares - a.avgCost * a.shares)[0]?.symbol;
  const { data: scoreRes } = useSWR<DataResult<StockScore>>(topSym ? `/api/score?symbol=${topSym}` : null, fetchJson);

  const valued = holdings.map((h) => {
    const q = quotes?.[h.symbol]?.data ?? null;
    const price = q?.price ?? null;
    const value = price != null ? price * h.shares : null;
    const cost = h.avgCost * h.shares;
    const gain = value != null ? value - cost : null;
    const gainPct = value != null && cost > 0 ? (gain! / cost) * 100 : null;
    const dayPct = q?.changePct ?? null;
    return { h, q, price, value, gain, gainPct, dayPct };
  });

  const total = valued.reduce((s, v) => s + (v.value ?? 0), 0);
  const totalCost = valued.reduce((s, v) => s + v.h.avgCost * v.h.shares, 0);
  const totalGain = total > 0 && totalCost > 0 ? total - totalCost : null;
  const totalGainPct = totalGain != null && totalCost > 0 ? (totalGain / totalCost) * 100 : null;
  const dayChange = valued.reduce((s, v) => s + (v.dayPct != null && v.value != null ? (v.dayPct / 100) * v.value : 0), 0);
  const dayPctTotal = total > 0 ? (dayChange / (total - dayChange)) * 100 : null;
  const winRate = (() => {
    const closed = journal.filter((j) => j.status === "closed" && (j.result1m || j.result1w));
    if (!closed.length) { const g = valued.filter((v) => v.gain != null); return g.length ? (g.filter((v) => v.gain! >= 0).length / g.length) * 100 : null; }
    const wins = closed.filter((j) => /\+|up|win|gain/i.test(j.result1m || j.result1w || "")).length;
    return (wins / closed.length) * 100;
  })();
  const anySource = quotes ? Object.values(quotes)[0]?.source : undefined;

  // Portfolio-value sparkline = sum(close × shares) across the window.
  const days = RANGES.find((r) => r.k === range)?.d ?? 22;
  const portfolioSeries: { v: number }[] = (() => {
    const lens = symbols.map((s) => (histories[s] ?? []).length);
    const maxLen = Math.min(days, Math.max(0, ...lens));
    if (maxLen < 2) return [];
    const out: { v: number }[] = [];
    for (let i = 0; i < maxLen; i++) {
      let sum = 0;
      for (const h of holdings) {
        const pts = histories[h.symbol] ?? [];
        const p = pts[pts.length - maxLen + i];
        if (p) sum += p.close * h.shares;
      }
      out.push({ v: sum });
    }
    return out;
  })();

  const alloc = valued.filter((v) => v.value != null && total > 0)
    .map((v) => ({ symbol: v.h.symbol, pct: (v.value! / total) * 100 })).sort((a, b) => b.pct - a.pct);
  // Top assets row: biggest holdings by value, each with its own sparkline.
  const topAssets = [...valued].filter((v) => v.value != null).sort((a, b) => (b.value! - a.value!)).slice(0, 3)
    .map((v) => ({ symbol: v.h.symbol, name: v.q?.name, price: v.price, dayPct: v.dayPct, series: (histories[v.h.symbol] ?? []).slice(-30).map((p) => ({ v: p.close })) }));
  const movers = valued.filter((v) => v.dayPct != null)
    .map((v) => ({ symbol: v.h.symbol, name: v.q?.name ?? v.h.symbol, dayPct: v.dayPct! }))
    .sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 5);

  // Activity feed: recent journal trades + an earnings alert from the score.
  const activity: ActivityItem[] = [
    ...journal.slice(0, 5).map((j) => ({ kind: "trade" as const, symbol: j.symbol, text: `${j.side === "buy" ? "Bought" : "Sold"} · ${j.entryReason || j.status}`, when: new Date(j.createdAt).toLocaleDateString(), href: "/journal" })),
  ];
  if (scoreRes?.data?.earningsInDays != null && scoreRes.data.earningsInDays >= 0 && scoreRes.data.earningsInDays <= 14) {
    activity.unshift({ kind: "alert", symbol: topSym!, text: `Earnings in ${scoreRes.data.earningsInDays} day${scoreRes.data.earningsInDays === 1 ? "" : "s"} — review position`, href: `/research?symbol=${topSym}` });
  }

  const score = scoreRes?.data;
  const hasHoldings = holdings.length > 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const firstLook = !hasHoldings ? null
    : score?.earningsInDays != null && score.earningsInDays >= 0 && score.earningsInDays <= 7
      ? `${topSym} reports ${score.earningsInDays === 0 ? "today" : `in ${score.earningsInDays} day${score.earningsInDays === 1 ? "" : "s"}`} and sits at ${alloc.find((a) => a.symbol === topSym)?.pct.toFixed(0) ?? "—"}% of your book.`
      : alloc[0] && alloc[0].pct > 40
        ? `${alloc[0].symbol} is ${alloc[0].pct.toFixed(0)}% of your portfolio — heavy concentration in one name.`
        : totalGain != null && totalGain < 0
          ? `You're down $${Math.abs(totalGain).toFixed(0)} overall — review the weakest positions.`
          : "Portfolio looks balanced. Scan top movers and upcoming earnings.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{greeting}, Noor</h1>
        <p className="mt-1 text-sm text-ink-dim">Your portfolio at a glance — research and education, not financial advice.</p>
      </div>

      {!hasHoldings ? (
        <EmptyState
          title="Add your first holding to bring this dashboard to life"
          hint="Add positions in Holdings — or sync E*TRADE / Robinhood — and you'll see live value, a trend line, allocation, and what to watch."
          action={<Link href="/holdings"><Button variant="gold">Add holdings</Button></Link>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-5">
            {firstLook && (
              <div className="flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm" style={{ borderColor: "var(--hairline-gold)", background: "var(--accent-soft)" }}>
                <AlertTriangle size={15} className="shrink-0 text-accent" />
                <span className="text-ink-dim"><span className="font-medium text-ink">Look first:</span> {firstLook}</span>
              </div>
            )}

            {/* Top assets row with sparklines */}
            {topAssets.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-ink-dim">Your top assets</h2>
                  <Link href="/holdings" className="text-xs text-accent hover:underline">All holdings</Link>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {topAssets.map((a) => <AssetCard key={a.symbol} {...a} />)}
                </div>
              </div>
            )}

            {/* Lead: portfolio value + sparkline */}
            <GlassCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-faint">Portfolio value</div>
                  <CountUp value={total} prefix="$" className="mt-1 block text-4xl font-semibold text-ink" />
                  <div className="mt-1 flex items-center gap-2 font-mono text-sm">
                    <span style={{ color: dayChange >= 0 ? "var(--positive)" : "var(--negative)" }}>
                      {dayChange >= 0 ? "▲" : "▼"} ${Math.abs(dayChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      {dayPctTotal != null && ` · ${Math.abs(dayPctTotal).toFixed(2)}%`}
                    </span>
                    <span className="text-ink-faint">today</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {anySource && <DataBadge source={anySource} />}
                  <div className="flex gap-0.5">
                    {RANGES.map((r) => (
                      <button key={r.k} onClick={() => setRange(r.k)}
                        className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${range === r.k ? "text-ink" : "text-ink-faint hover:text-ink-dim"}`}
                        style={range === r.k ? { background: "var(--accent-soft)" } : undefined}>{r.k}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3"><Sparkline data={portfolioSeries} height={120} /></div>
            </GlassCard>

            {/* Gradient stat row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <GradientStat label="Total gain" tone={(totalGain ?? 0) >= 0 ? "emerald" : "rose"}
                value={totalGain != null ? `${totalGain >= 0 ? "+" : "−"}$${Math.abs(totalGain).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                sub={totalGainPct != null ? `${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(1)}% all-time` : undefined} />
              <GradientStat label="Day change" tone={dayChange >= 0 ? "emerald" : "rose"}
                value={`${dayChange >= 0 ? "+" : "−"}$${Math.abs(dayChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                sub={dayPctTotal != null ? `${dayPctTotal >= 0 ? "+" : ""}${dayPctTotal.toFixed(2)}% today` : undefined} />
              <GradientStat label="Win rate" tone="violet" value={winRate != null ? `${winRate.toFixed(0)}%` : "—"} sub="positions in profit" />
              <GradientStat label="Positions" tone="amber" value={`${holdings.length}`} sub={`${watchlist.length} on watch`} />
            </div>

            {/* Allocation + movers */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <GlassCard hover>
                <div className="text-sm font-semibold text-ink">Allocation</div>
                <ul className="mt-3 space-y-2.5">
                  {alloc.slice(0, 6).map((a) => (
                    <li key={a.symbol} className="flex items-center gap-3 text-sm">
                      <Link href={`/holdings/${a.symbol}`} className="w-14 shrink-0 font-mono font-medium text-ink hover:text-accent">{a.symbol}</Link>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--hairline-strong)" }}>
                        <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: "var(--accent)" }} />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-dim">{a.pct.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </GlassCard>
              <GlassCard hover>
                <div className="flex items-center gap-2 text-sm font-semibold text-ink"><TrendingUp size={15} className="text-accent" /> Top movers today</div>
                <ul className="mt-3 space-y-2">
                  {movers.length === 0 && <li className="text-sm text-ink-faint">No live moves yet.</li>}
                  {movers.map((m) => (
                    <li key={m.symbol} className="flex items-center justify-between text-sm">
                      <Link href={`/holdings/${m.symbol}`} className="flex items-baseline gap-2">
                        <span className="font-mono font-medium text-ink hover:text-accent">{m.symbol}</span>
                        <span className="truncate text-xs text-ink-faint">{m.name}</span>
                      </Link>
                      <span className="font-mono text-sm" style={{ color: m.dayPct >= 0 ? "var(--positive)" : "var(--negative)" }}>{m.dayPct >= 0 ? "▲" : "▼"} {Math.abs(m.dayPct).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </div>

            {/* Market overview */}
            <div>
              <h2 className="text-sm font-medium text-ink-dim">Market overview</h2>
              <p className="mb-3 mt-0.5 text-[11px] text-ink-faint">The broad market (S&amp;P 500), big tech (Nasdaq-100), and the fear gauge (VIX).</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <QuoteProbe symbol="SPY" label="S&P 500 (SPY)" hint="The 500 largest US companies — the broad market." />
                <QuoteProbe symbol="QQQ" label="Nasdaq-100 (QQQ)" hint="The 100 biggest non-financial tech-heavy names." />
                <QuoteProbe symbol="^VIX" label="VIX — fear gauge" hint="Expected 30-day volatility. Higher = more fear." />
              </div>
            </div>
          </div>

          {/* Right rail */}
          <div className="space-y-5">
            <GlassCard hover>
              <div className="text-xs uppercase tracking-wide text-ink-faint">Portfolio health</div>
              {score ? (
                <>
                  <div className="mt-3"><ScoreGauge score={score.overall} label={score.label} size={104} /></div>
                  <p className="mt-3 text-xs text-ink-dim">{score.topReason}</p>
                  <Link href="/portfolio-doctor" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">Full check-up <ArrowUpRight size={12} /></Link>
                </>
              ) : <p className="mt-4 text-sm text-ink-faint">Scoring your largest holding…</p>}
            </GlassCard>

            <ActivityRail items={activity} />

            <GlassCard hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Eye size={15} className="text-accent" /> Watchlist</div>
                <Link href="/watchlist" className="text-xs text-accent hover:underline">Open</Link>
              </div>
              {watchlist.length === 0 ? <p className="mt-2 text-sm text-ink-faint">Nothing on your watchlist yet.</p> : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {watchlist.slice(0, 12).map((w) => (
                    <Link key={w.symbol} href={`/research?symbol=${w.symbol}`} className="rounded-md border border-hairline px-2 py-1 font-mono text-xs text-ink-dim hover:text-accent hover:border-hairline-strong">{w.symbol}</Link>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      <p className="text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
