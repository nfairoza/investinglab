import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { readServerCache } from "@/lib/server-cache";
import { isEntitled } from "@/lib/billing/entitlements";
import { computeFlow } from "@/lib/power-trades/flow";
import { FLOW_CACHE_KEY, type FlowCache } from "@/lib/power-trades/flow-run";

export const dynamic = "force-dynamic";

// GET /api/power-trades/flow?chamber=&party= — PT6. Congressional trading flow:
// net-buying-by-sector heatmap + top net-bought/sold tickers. Reads the cached
// raw trades (built by the pt-flow cron) and filters + aggregates on read. Plan-
// gated (pt_flow_views = Premium; billing-off ships to all). No API cost.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Server-side gate (client hook is display-only).
  if (!isEntitled("pt_flow_views", "free", ctx.isAdmin)) {
    return NextResponse.json({ error: "upgrade_required", feature: "pt_flow_views" }, { status: 403 });
  }

  const chamberParam = req.nextUrl.searchParams.get("chamber");
  const partyParam = req.nextUrl.searchParams.get("party");
  const chamber = chamberParam === "house" || chamberParam === "senate" ? chamberParam : "all";
  const party = partyParam === "D" || partyParam === "R" || partyParam === "I" ? partyParam : "all";

  const { value, generatedAt } = await readServerCache<FlowCache>(FLOW_CACHE_KEY, Number.MAX_SAFE_INTEGER);
  if (!value || !value.trades?.length) {
    return NextResponse.json({ bySector: [], topBought: [], topSold: [], months: [], totalTrades: 0, asOf: null, note: "not_built" });
  }

  const result = computeFlow(value.trades, { chamber, party });
  return NextResponse.json({ ...result, asOf: value.builtAt ?? generatedAt, windowDays: value.windowDays });
}
