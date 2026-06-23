import { NextResponse } from "next/server";
import { getStockPositions, normalizeRhState, rhStocksConnected } from "@/lib/robinhood/stocks";
import { getUserClient } from "@/lib/supabase-data";
import { readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// GET /api/robinhood/stocks-sync — pull the CURRENT user's live equity positions
// via the unofficial RH API and store them in their own holdings rows
// (source "robinhood", assetType stock).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await readBrokerConnection(ctx, "robinhood");
  const rh = normalizeRhState(conn.data as any);
  if (!rhStocksConnected(rh)) {
    return NextResponse.json({ error: "Log in to Robinhood (stocks) in Connect brokerage first." }, { status: 400 });
  }

  try {
    const positions = await getStockPositions(rh.accessToken!);
    const rows = positions.map((p) => ({
      user_id: ctx.userId,
      symbol: p.symbol,
      shares: p.quantity,
      avg_cost: p.avgCost,
      note: "Robinhood stocks",
      source: "robinhood",
      asset_type: "stock",
      updated_at: new Date().toISOString(),
    }));

    // Replace only this user's robinhood-stock rows.
    await ctx.supabase.from("holdings").delete().eq("source", "robinhood").eq("asset_type", "stock");
    if (rows.length) await ctx.supabase.from("holdings").insert(rows);

    return NextResponse.json({ imported: rows.length });
  } catch (e: any) {
    const msg = e?.status === 401
      ? "Robinhood session expired — log in again in Connect brokerage."
      : (e instanceof Error ? e.message : "Stocks sync failed");
    return NextResponse.json({ error: msg }, { status: e?.status === 401 ? 401 : 500 });
  }
}
