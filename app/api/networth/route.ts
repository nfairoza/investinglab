import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { computeNetWorth, currentMonth } from "@/lib/networth";

export const dynamic = "force-dynamic";

// GET /api/networth — computes net worth (assets − liabilities) across Plaid +
// holdings + manual items, with type breakdown and liquid/illiquid split. Upserts
// the current month's snapshot ONLY when balances changed or none exists yet
// (write discipline — no write on every render). Returns the monthly trend.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const nw = await computeNetWorth(ctx);
  const month = currentMonth();

  // Write discipline: only upsert if this month's snapshot is missing or the
  // source balances changed since it was captured.
  const { data: existing } = await ctx.supabase
    .from("net_worth_snapshots")
    .select("net_worth, by_type")
    .eq("month", month)
    .maybeSingle();

  const changed = !existing
    || Math.round(Number(existing.net_worth)) !== Math.round(nw.netWorth)
    || (existing.by_type as any)?.__hash !== nw.sourceHash;

  if (changed) {
    try {
      await ctx.supabase.from("net_worth_snapshots").upsert(
        {
          user_id: ctx.userId,
          month,
          total_assets: nw.totalAssets,
          total_liabilities: nw.totalLiabilities,
          net_worth: nw.netWorth,
          by_type: { ...nw.byType, __hash: nw.sourceHash },
          captured_at: new Date().toISOString(),
        },
        { onConflict: "user_id,month" },
      );
    } catch { /* snapshot is best-effort */ }
  }

  // Trend: monthly snapshots ascending.
  const { data: trendRows } = await ctx.supabase
    .from("net_worth_snapshots")
    .select("month, net_worth, total_assets, total_liabilities")
    .order("month", { ascending: true });

  // Change vs last month.
  const trend = (trendRows ?? []).map((t: any) => ({
    month: t.month,
    netWorth: Number(t.net_worth),
    assets: Number(t.total_assets),
    liabilities: Number(t.total_liabilities),
  }));
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const changeAmount = prev ? nw.netWorth - prev.netWorth : null;
  const changePct = prev && prev.netWorth !== 0 ? (changeAmount! / Math.abs(prev.netWorth)) * 100 : null;

  return NextResponse.json({
    asOf: new Date().toISOString(),
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    netWorth: nw.netWorth,
    liquid: nw.liquid,
    illiquid: nw.illiquid,
    byType: nw.byType,
    items: nw.items,
    excluded: nw.excluded,
    trend,
    changeAmount: changeAmount != null ? +changeAmount.toFixed(2) : null,
    changePct: changePct != null ? +changePct.toFixed(1) : null,
  });
}
