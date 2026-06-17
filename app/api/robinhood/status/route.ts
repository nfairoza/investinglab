import { NextResponse } from "next/server";
import { hasCryptoKeys } from "@/lib/robinhood/crypto";
import { rhStocksConnected, rhStocksConnectedAt } from "@/lib/robinhood/stocks";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    cryptoConfigured: hasCryptoKeys(),
    stocksConnected: rhStocksConnected(),
    stocksConnectedAt: rhStocksConnectedAt(),
  });
}
