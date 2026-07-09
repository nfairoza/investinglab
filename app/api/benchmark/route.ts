import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { marketData } from "@/lib/providers";
import { buildComparison, hasLikelyCashFlow, windowStart, type SeriesPoint, type Period } from "@/lib/returns/compute";

export const dynamic = "force-dynamic";

// GET /api/benchmark?bench=QQQ — portfolio vs SPY (+ optional 2nd benchmark)
// across 1M/3M/YTD/1Y. Portfolio series = investment slice of monthly net-worth
// snapshots (naive TWR proxy — see docs/RETURNS.md). Honest: flags likely cash
// flows in the window.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const bench2 = (req.nextUrl.searchParams.get("bench") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const nowMs = Date.now();

  // Portfolio investment series from monthly snapshots.
  const { data: nwRows } = await ctx.supabase
    .from("net_worth_snapshots").select("month, by_type").eq("user_id", ctx.userId).order("month", { ascending: true });
  const portfolio: SeriesPoint[] = (nwRows ?? [])
    .map((r: any) => ({ date: String(r.month), value: Number((r.by_type as any)?.investment ?? 0) }))
    .filter((p) => p.value > 0);

  if (portfolio.length < 2) {
    return NextResponse.json({ available: false, note: "Need at least two monthly snapshots to compute a return.", rows: [] });
  }

  // Benchmark price series (SPY always; a 2nd if requested + valid).
  const benchSymbols = ["SPY", ...(bench2 && bench2 !== "SPY" ? [bench2] : [])];
  const histories = await Promise.all(benchSymbols.map((s) => marketData.getPriceHistory(s).catch(() => null)));
  const benchSeries: Record<string, SeriesPoint[]> = {};
  benchSymbols.forEach((s, i) => {
    const pts = histories[i]?.data?.points ?? [];
    benchSeries[s] = pts.map((p: { date: string; close: number }) => ({ date: p.date, value: p.close }));
  });

  const benchmarks = benchSymbols.map((s) => ({ symbol: s, rows: buildComparison(portfolio, benchSeries[s], nowMs) }));

  // Cash-flow caveat per period (from the portfolio series).
  const periods: Period[] = ["1M", "3M", "YTD", "1Y"];
  const caveats: Record<string, boolean> = {};
  for (const p of periods) caveats[p] = hasLikelyCashFlow(portfolio, windowStart(p, nowMs));

  return NextResponse.json({ available: true, benchmarks, caveats, asOf: new Date(nowMs).toISOString() });
}
