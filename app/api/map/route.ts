import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import type { DataResult, Quote } from "@/lib/providers/types";
import { readMapBuild, buildMap, MAP_PERIODS, type MapPeriod, type MapBuild } from "@/lib/market/map-build";

export const dynamic = "force-dynamic";

export interface MapNode {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  changePct: number;
  priced: boolean;
}

// GET /api/map?period=1D&extra=SYM,SYM
// Serves the cron-built map from cache (read-only, fast). The full S&P 500
// universe is priced on the cron into a single global entry — user requests never
// price it per-request. `extra` (the user's owned tickers outside the S&P 500)
// are quoted individually and appended under "My Holdings".
export async function GET(req: NextRequest) {
  const periodRaw = (req.nextUrl.searchParams.get("period") ?? "1D").toUpperCase();
  const period: MapPeriod = (MAP_PERIODS as readonly string[]).includes(periodRaw) ? (periodRaw as MapPeriod) : "1D";

  // Read the cached build. Cold path (never built): build once so the map isn't
  // empty on first-ever load. The client shows a loading state until this returns.
  let build: MapBuild | null = await readMapBuild();
  if (!build) {
    try { build = await buildMap("full"); } catch { build = null; }
  }

  const universe = build?.tiles ?? [];
  const inUniverse = new Set(universe.map((t) => t.symbol.toUpperCase()));

  // Project each tile to the selected period. Unpriced tiles (changePct absent)
  // keep priced:false so the UI can render them neutral-gray, never a fake zero.
  const nodes: MapNode[] = universe.map((t) => ({
    symbol: t.symbol,
    name: t.name,
    sector: t.sector,
    marketCap: t.marketCap,
    changePct: t.changes[period] ?? 0,
    priced: t.priced && t.changes[period] != null,
  }));

  // "My Holdings" overlay: owned tickers NOT in the S&P 500 universe get an
  // individual live quote (1D only — period returns aren't built for them) so the
  // My-Holdings view is complete.
  const extra = (req.nextUrl.searchParams.get("extra") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    .filter((s) => !inUniverse.has(s));
  if (extra.length) {
    const quotes: Record<string, DataResult<Quote>> = await marketData.getQuotes(extra).catch(() => ({}));
    for (const s of extra) {
      const q = quotes[s]?.data ?? null;
      nodes.push({
        symbol: s,
        name: q?.name ?? s,
        sector: "My Holdings",
        marketCap: q?.marketCap ?? 0,
        changePct: q?.changePct ?? 0,
        priced: q != null && (q.marketCap ?? 0) > 0,
      });
    }
  }

  const sectors = build?.sectors ?? [];
  return NextResponse.json({
    nodes,
    sectors,
    period,
    periods: MAP_PERIODS,
    sectorCounts: build?.sectorCounts ?? {},
    pricedCount: build?.pricedCount ?? 0,
    totalCount: build?.totalCount ?? 0,
    source: build && nodes.some((n) => n.priced) ? "live" : "unavailable",
    asOf: build?.builtAt ?? new Date().toISOString(),
  });
}
