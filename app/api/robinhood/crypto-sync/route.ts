import { NextResponse } from "next/server";
import { getCryptoHoldings, hasCryptoKeys } from "@/lib/robinhood/crypto";
import { withDbWrite, newId, now, type Holding } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/robinhood/crypto-sync — pull live crypto holdings from Robinhood's
// official API and store them as holdings (source "robinhood", assetType crypto).
export async function GET() {
  if (!hasCryptoKeys()) {
    return NextResponse.json({ error: "Add your Robinhood crypto API key + private key in Connectors." }, { status: 400 });
  }
  try {
    const holdings = await getCryptoHoldings();
    const incoming: Holding[] = holdings.map((h) => ({
      id: newId(),
      symbol: h.symbol,
      shares: h.quantity,
      avgCost: h.costBasis != null && h.quantity ? h.costBasis / h.quantity : 0,
      note: "Robinhood crypto",
      source: "robinhood",
      assetType: "crypto",
      createdAt: now(),
      updatedAt: now(),
    }));

    const result = await withDbWrite((db) => {
      // Replace only robinhood-crypto rows; keep everything else.
      const others = db.data.holdings.filter((h) => !(h.source === "robinhood" && h.assetType === "crypto"));
      db.data.holdings = [...others, ...incoming];
      return db.data.holdings;
    });
    return NextResponse.json({ imported: incoming.length, holdings: result });
  } catch (e: any) {
    const msg = e?.status === 401
      ? "Robinhood crypto auth failed — check your API key + private key."
      : (e instanceof Error ? e.message : "Crypto sync failed");
    return NextResponse.json({ error: msg }, { status: e?.status === 401 ? 401 : 500 });
  }
}
