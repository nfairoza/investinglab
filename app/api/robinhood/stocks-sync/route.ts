import { NextResponse } from "next/server";
import { getStockPositions, rhStocksConnected } from "@/lib/robinhood/stocks";
import { withDbWrite, newId, now, type Holding } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/robinhood/stocks-sync — pull live equity positions via the unofficial
// RH API and store them as holdings (source "robinhood", assetType stock).
export async function GET() {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!rhStocksConnected()) {
    return NextResponse.json({ error: "Log in to Robinhood (stocks) in Connectors first." }, { status: 400 });
  }
  try {
    const positions = await getStockPositions();
    const incoming: Holding[] = positions.map((p) => ({
      id: newId(),
      symbol: p.symbol,
      shares: p.quantity,
      avgCost: p.avgCost,
      note: "Robinhood stocks",
      source: "robinhood",
      assetType: "stock",
      createdAt: now(),
      updatedAt: now(),
    }));

    const result = await withDbWrite((db) => {
      const others = db.data.holdings.filter((h) => !(h.source === "robinhood" && (h.assetType ?? "stock") === "stock"));
      db.data.holdings = [...others, ...incoming];
      return db.data.holdings;
    });
    return NextResponse.json({ imported: incoming.length, holdings: result });
  } catch (e: any) {
    const msg = e?.status === 401
      ? "Robinhood session expired — log in again in Connectors."
      : (e instanceof Error ? e.message : "Stocks sync failed");
    return NextResponse.json({ error: msg }, { status: e?.status === 401 ? 401 : 500 });
  }
}
