import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { getHourlySeries, hourlyDisabled } from "@/lib/providers/intraday";

export const dynamic = "force-dynamic";

interface SeriesPoint { v: number; date: string } // date = "YYYY-MM-DD HH:MM"

// GET /api/portfolio-hourly — a denser 1M portfolio-value series built from
// hourly bars (~150 points) instead of ~22 daily closes. Same aggregation as the
// intraday route: hourly close × shares, summed per aligned timestamp with
// forward-fill. Returns { disabled:true } when the hourly endpoint is plan-
// restricted, so the client falls back to the daily-close series it already has.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (await hourlyDisabled()) return NextResponse.json({ disabled: true, series: [] });

  const holdings = (await getUnifiedHoldings(ctx.supabase, { realTickersOnly: true }).catch(() => []))
    .filter((h) => h.shares > 0);
  if (!holdings.length) return NextResponse.json({ disabled: false, series: [] });

  const sharesBySym = new Map<string, number>();
  for (const h of holdings) sharesBySym.set(h.symbol.toUpperCase(), (sharesBySym.get(h.symbol.toUpperCase()) ?? 0) + h.shares);
  const symbols = Array.from(sharesBySym.keys());

  const seriesBySym = new Map<string, Map<string, number>>();
  const allTimes = new Set<string>();
  let anyDisabled = false;
  await Promise.all(symbols.map(async (sym) => {
    const { bars, disabled } = await getHourlySeries(sym, 30);
    if (disabled) { anyDisabled = true; return; }
    const m = new Map<string, number>();
    for (const b of bars) { m.set(b.date, b.close); allTimes.add(b.date); }
    if (m.size) seriesBySym.set(sym, m);
  }));
  if (anyDisabled) return NextResponse.json({ disabled: true, series: [] });
  if (allTimes.size < 2) return NextResponse.json({ disabled: false, series: [] });

  const times = Array.from(allTimes).sort();
  const lastClose = new Map<string, number>();
  const series: SeriesPoint[] = times.map((t) => {
    let sum = 0;
    for (const sym of symbols) {
      const px = seriesBySym.get(sym)?.get(t);
      if (px != null) lastClose.set(sym, px);
      const val = lastClose.get(sym);
      if (val != null) sum += val * (sharesBySym.get(sym) ?? 0);
    }
    return { v: +sum.toFixed(2), date: t };
  }).filter((p) => p.v > 0);

  return NextResponse.json({ disabled: false, series, asOf: new Date().toISOString() });
}
