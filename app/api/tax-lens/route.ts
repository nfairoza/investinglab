import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { buildTaxLens, isDecemberMode, type TaxPosition } from "@/lib/tax/lens";

export const dynamic = "force-dynamic";

// GET /api/tax-lens — F7 education-only unrealized gain/loss lens. Per-position
// (Plaid gives position-level cost basis, not lots), short/long-term only where
// a holding-period date exists (never guessed). December mode surfaces loss
// positions as harvest candidates. NOT tax advice.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const holdings = (await getUnifiedHoldings(ctx.supabase, { userId: ctx.userId, realTickersOnly: true }).catch(() => []))
    .filter((h) => h.symbol && !h.symbol.includes("-") && h.avgCost > 0);
  if (!holdings.length) return NextResponse.json({ available: false, decemberMode: isDecemberMode(Date.now()) });

  const quotes = await marketData.getQuotes(holdings.map((h) => h.symbol)).catch(() => ({} as Record<string, DataResult<Quote>>));
  const positions: TaxPosition[] = holdings.map((h) => ({
    symbol: h.symbol, shares: h.shares, avgCost: h.avgCost,
    price: quotes[h.symbol]?.data?.price ?? null,
    acquiredDate: null, // Plaid holdings don't expose lot acquisition dates
  }));

  const lens = buildTaxLens(positions, Date.now());
  return NextResponse.json({ available: true, decemberMode: isDecemberMode(Date.now()), lens, asOf: new Date().toISOString() });
}
