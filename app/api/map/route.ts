import { NextResponse } from "next/server";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

// Curated S&P-style universe grouped by sector (sector is static metadata — FMP's
// bulk/constituent endpoints are paid, so we hardcode a representative set of
// large caps and fetch each quote live). Quotes are cached 90s in the FMP layer.
const UNIVERSE: Record<string, string[]> = {
  "Technology": ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "ADBE", "AMD", "CSCO", "ACN", "INTC", "QCOM", "TXN", "IBM", "NOW", "INTU", "PLTR", "MU"],
  "Communication": ["GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T", "CMCSA"],
  "Consumer Cyclical": ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "BKNG", "TJX"],
  "Consumer Defensive": ["WMT", "PG", "COST", "KO", "PEP", "PM", "MDLZ"],
  "Financial": ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "BLK", "C", "SCHW"],
  "Healthcare": ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "PFE", "DHR", "AMGN", "ISRG"],
  "Energy": ["XOM", "CVX", "COP", "SLB", "EOG"],
  "Industrials": ["GE", "CAT", "RTX", "UNP", "HON", "BA", "DE", "LMT"],
  "Utilities": ["NEE", "DUK", "SO"],
  "Real Estate": ["PLD", "AMT", "EQIX"],
  "Materials": ["LIN", "SHW", "FCX"],
};

export interface MapNode {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  changePct: number;
}

export async function GET() {
  const jobs: Promise<MapNode | null>[] = [];
  for (const [sector, syms] of Object.entries(UNIVERSE)) {
    for (const symbol of syms) {
      jobs.push(
        marketData.getQuote(symbol).then((q) => {
          if (!q.data) return null;
          return {
            symbol,
            name: q.data.name ?? symbol,
            sector,
            marketCap: q.data.marketCap ?? 0,
            changePct: q.data.changePct ?? 0,
          } as MapNode;
        }).catch(() => null),
      );
    }
  }
  const nodes = (await Promise.all(jobs)).filter((n): n is MapNode => n != null && n.marketCap > 0);
  // source is "live" if we got real data, else demo
  const anyLive = nodes.length > 0;
  return NextResponse.json({
    nodes,
    sectors: Object.keys(UNIVERSE),
    source: anyLive ? "live" : "unavailable",
    asOf: new Date().toISOString(),
  });
}
