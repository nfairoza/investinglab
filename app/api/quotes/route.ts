import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

// GET /api/quotes?symbols=AAPL,MSFT,NVDA — batch quotes in one request (P3).
// Returns a per-symbol DataResult map so a watchlist of N names is one HTTP call
// (and one FMP batch call) instead of N.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ quotes: {} });
  const quotes = await marketData.getQuotes(symbols);
  return NextResponse.json({ quotes }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300" },
  });
}
