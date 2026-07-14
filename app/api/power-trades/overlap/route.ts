import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";
import { computeOverlap, type OverlapTrade, type OverlapHolding } from "@/lib/power-trades/overlap";

export const dynamic = "force-dynamic";

// GET /api/power-trades/overlap — PT6. "People you follow traded stocks you own."
// Computed per user at read time from follows × holdings × recent trades — all
// local tables, zero API cost. Not plan-gated (it's the moat; ships to everyone).
export async function GET(_req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;

  // Follows (per-user, RLS via the user client) — the names to match on.
  const { data: followRows } = await supabase.from("follows").select("person_name").eq("user_id", userId);
  const followedNames = (followRows ?? []).map((r: any) => String(r.person_name)).filter(Boolean);

  // Holdings + value (cost-basis proxy when market_value absent).
  const { data: holdRows } = await supabase.from("holdings").select("symbol, shares, avg_cost, market_value").eq("user_id", userId);
  const holdings: OverlapHolding[] = (holdRows ?? []).map((h: any) => {
    const mv = Number(h.market_value);
    const value = Number.isFinite(mv) && mv > 0 ? mv : (Number(h.shares) || 0) * (Number(h.avg_cost) || 0);
    return { symbol: String(h.symbol).toUpperCase(), value };
  }).filter((h: OverlapHolding) => h.value > 0);

  if (followedNames.length === 0 || holdings.length === 0) {
    return NextResponse.json({ matches: [] });
  }

  // Recent trades (last 60d) by any followed person — service role reads the
  // shared power_trade_records; we filter to the user's follows in pure code.
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ matches: [] });
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const { data: tradeRows } = await sb
    .from("power_trade_records")
    .select("person_name, ticker, transaction_type, amount_label, disclosure_date")
    .in("transaction_type", ["buy", "sell"])
    .not("ticker", "is", null)
    .gte("disclosure_date", since)
    .limit(5_000);
  const recentTrades: OverlapTrade[] = (tradeRows ?? []).map((t: any) => ({
    personName: String(t.person_name),
    ticker: String(t.ticker),
    type: t.transaction_type,
    amountLabel: t.amount_label ?? null,
    disclosureDate: t.disclosure_date ?? null,
  }));

  const matches = computeOverlap(followedNames, holdings, recentTrades);
  return NextResponse.json({ matches });
}
