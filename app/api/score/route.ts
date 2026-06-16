import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import type { DataResult } from "@/lib/providers/types";
import { computeScore, type StockScore } from "@/lib/scoring/score";

export const dynamic = "force-dynamic";

// /api/score?symbol=AAPL -> transparent rules-based score from live data.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const [quote, financials, technicals, earnings] = await Promise.all([
    marketData.getQuote(symbol),
    marketData.getFinancials(symbol),
    marketData.getTechnicals(symbol),
    marketData.getEarningsDate(symbol),
  ]);

  if (!quote.data) {
    const out: DataResult<StockScore> = { data: null, source: "unavailable", asOf: null, provider: quote.provider, note: quote.note ?? "no data" };
    return NextResponse.json(out);
  }

  const score = computeScore({
    quote: quote.data,
    financials: financials.data,
    technicals: technicals.data,
    earnings: earnings.data,
  });

  const out: DataResult<StockScore> = {
    data: score,
    source: quote.source, // score is only as live as the data behind it
    asOf: quote.asOf,
    provider: quote.provider,
    note: quote.source === "demo" ? "Scored on demo data — add a stock-data key in Connectors." : undefined,
  };
  return NextResponse.json(out);
}
