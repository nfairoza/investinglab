import { NextResponse } from "next/server";
import { hasCryptoKeys } from "@/lib/robinhood/crypto";
import { rhStocksConnected, rhStocksConnectedAt } from "@/lib/robinhood/stocks";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

export async function GET() {
  // Admin-only while Robinhood tokens are shared; others see "not connected".
  if (!(await getAdminClient())) {
    return NextResponse.json({ cryptoConfigured: false, stocksConnected: false, stocksConnectedAt: null });
  }
  return NextResponse.json({
    cryptoConfigured: hasCryptoKeys(),
    stocksConnected: rhStocksConnected(),
    stocksConnectedAt: rhStocksConnectedAt(),
  });
}
