import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import type { DataResult, PriceHistory } from "@/lib/providers/types";
import { getConnectorValue } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

function fmpKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// Intraday (1-day) series from FMP's 5-minute chart. Returns the most recent
// trading day's points so the chart can show a same-day line.
async function getIntraday(symbol: string): Promise<DataResult<PriceHistory>> {
  const key = fmpKey();
  if (!key) return { data: null, source: "unavailable", asOf: null, provider: "FMP", note: "no key" };
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/historical-chart/5min?symbol=${encodeURIComponent(symbol)}&apikey=${key}`, { cache: "no-store" });
    if (!r.ok) return { data: null, source: "unavailable", asOf: null, provider: "FMP", note: `HTTP ${r.status}` };
    const arr = (await r.json()) as any[];
    if (!Array.isArray(arr) || !arr.length) return { data: null, source: "unavailable", asOf: null, provider: "FMP", note: "no intraday data" };
    // FMP returns newest-first; the latest trading day is the date of arr[0].
    const latestDay = String(arr[0].date).slice(0, 10);
    const points = arr
      .filter((p) => String(p.date).slice(0, 10) === latestDay)
      .map((p) => ({ date: String(p.date).slice(11, 16), close: Number(p.close) })) // HH:MM
      .reverse(); // oldest -> newest for left-to-right
    return { data: { symbol, points }, source: "live", asOf: arr[0].date, provider: "FMP" };
  } catch (e) {
    return { data: null, source: "unavailable", asOf: null, provider: "FMP", note: e instanceof Error ? e.message : "intraday fetch failed" };
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  if (req.nextUrl.searchParams.get("range") === "1D") {
    return NextResponse.json(await getIntraday(symbol));
  }
  return NextResponse.json(await marketData.getPriceHistory(symbol));
}
