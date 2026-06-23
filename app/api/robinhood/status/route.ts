import { NextResponse } from "next/server";
import { hasCryptoCreds } from "@/lib/robinhood/crypto";
import { normalizeRhState, rhStocksConnected } from "@/lib/robinhood/stocks";
import { getBrokerCtx, readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// GET /api/robinhood/status — the CURRENT user's Robinhood connection state.
export async function GET() {
  const ctx = await getBrokerCtx();
  if (!ctx) {
    return NextResponse.json({ cryptoConfigured: false, stocksConnected: false, stocksConnectedAt: null });
  }
  const conn = await readBrokerConnection(ctx, "robinhood");
  const rh = normalizeRhState(conn.data as any);
  return NextResponse.json({
    cryptoConfigured: hasCryptoCreds(conn.data.crypto),
    stocksConnected: rhStocksConnected(rh),
    stocksConnectedAt: rh.connectedAt,
  });
}
