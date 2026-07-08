import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { getIntradaySeries, intradayDisabled } from "@/lib/providers/intraday";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

interface SeriesPoint { v: number; date: string } // date = "HH:MM" ET

// GET /api/portfolio-intraday
// Builds a REAL same-session portfolio value series: for each holding, today's
// 15-min bars × shares, summed per aligned timestamp (forward-filling symbols
// that lack a bar at a given time). Also returns a normalized SPY intraday line
// for the "vs S&P 500 today" comparison. When the intraday endpoint is plan-
// restricted, returns { disabled:true } so the client shows the day-change number
// with a note instead of a fake two-point line.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (await intradayDisabled()) return NextResponse.json({ disabled: true, series: [], benchmark: [] });

  const holdings = (await getUnifiedHoldings(ctx.supabase, { realTickersOnly: true }).catch(() => []))
    .filter((h) => h.shares > 0);
  if (!holdings.length) return NextResponse.json({ disabled: false, series: [], benchmark: [] });

  const sharesBySym = new Map<string, number>();
  for (const h of holdings) sharesBySym.set(h.symbol.toUpperCase(), (sharesBySym.get(h.symbol.toUpperCase()) ?? 0) + h.shares);
  const symbols = Array.from(sharesBySym.keys());

  // Fetch each symbol's intraday bars (cached per-symbol). If any call reports the
  // endpoint is plan-restricted, degrade the whole 1D view honestly.
  const seriesBySym = new Map<string, Map<string, number>>(); // sym -> (time -> close)
  const allTimes = new Set<string>();
  let anyDisabled = false;
  await Promise.all(symbols.map(async (sym) => {
    const { bars, disabled } = await getIntradaySeries(sym);
    if (disabled) { anyDisabled = true; return; }
    const m = new Map<string, number>();
    for (const b of bars) { m.set(b.time, b.close); allTimes.add(b.time); }
    if (m.size) seriesBySym.set(sym, m);
  }));
  if (anyDisabled) return NextResponse.json({ disabled: true, series: [], benchmark: [] });
  if (allTimes.size < 2) return NextResponse.json({ disabled: false, series: [], benchmark: [] });

  const times = Array.from(allTimes).sort(); // "HH:MM" sorts lexicographically = chronological
  const lastClose = new Map<string, number>(); // forward-fill state per symbol

  const series: SeriesPoint[] = times.map((t) => {
    let sum = 0;
    for (const sym of symbols) {
      const m = seriesBySym.get(sym);
      const px = m?.get(t);
      if (px != null) lastClose.set(sym, px);
      const val = lastClose.get(sym);
      if (val != null) sum += val * (sharesBySym.get(sym) ?? 0);
    }
    return { v: +sum.toFixed(2), date: t };
  }).filter((p) => p.v > 0);

  // SPY intraday, normalized to the portfolio's opening value so the two lines
  // share a scale ("what if the whole portfolio moved like the S&P today").
  let benchmark: SeriesPoint[] = [];
  const { bars: spyBars } = await getIntradaySeries("SPY");
  if (spyBars.length > 1 && series.length > 1) {
    const spyByTime = new Map(spyBars.map((b) => [b.time, b.close]));
    const base = series[0].v;
    const spyBase = spyBars[0].close;
    let lastSpy = spyBase;
    benchmark = times.map((t) => {
      const px = spyByTime.get(t);
      if (px != null) lastSpy = px;
      return { v: +((lastSpy / spyBase) * base).toFixed(2), date: t };
    });
  }

  // ── Sanity assertion ──
  // A correct portfolio day-% can't exceed its most extreme single holding's
  // day-% (it's a value-weighted blend). If it does by >3x, that's an aggregation
  // bug (double-count, share mismatch), not a market move — log a warning.
  await sanityCheckDayChange(ctx, symbols, sharesBySym).catch(() => {});

  return NextResponse.json({ disabled: false, series, benchmark, asOf: new Date().toISOString() });
}

async function sanityCheckDayChange(
  ctx: { userId: string },
  symbols: string[],
  sharesBySym: Map<string, number>,
): Promise<void> {
  const quotes: Record<string, DataResult<Quote>> = await marketData.getQuotes(symbols).catch(() => ({}));
  let value = 0, prevValue = 0, maxAbsPct = 0;
  for (const sym of symbols) {
    const q = quotes[sym]?.data;
    if (!q?.price) continue;
    const shares = sharesBySym.get(sym) ?? 0;
    const v = q.price * shares;
    const pct = q.changePct ?? 0;
    const prev = v / (1 + pct / 100);
    value += v;
    prevValue += prev;
    if (Math.abs(pct) > maxAbsPct) maxAbsPct = Math.abs(pct);
  }
  if (prevValue <= 0 || maxAbsPct <= 0) return;
  const portfolioPct = Math.abs(((value - prevValue) / prevValue) * 100);
  if (portfolioPct > 3 * maxAbsPct) {
    await logError({
      message: `Portfolio day-change sanity check failed: portfolio ${portfolioPct.toFixed(2)}% vs max single-holding ${maxAbsPct.toFixed(2)}% (>3x) — likely an aggregation bug, not a market move.`,
      category: "market_data",
      section: "portfolio-intraday",
      severity: "warning",
      userId: ctx.userId,
      meta: { portfolioPct: +portfolioPct.toFixed(2), maxHoldingPct: +maxAbsPct.toFixed(2), symbols: symbols.length },
    });
  }
}
