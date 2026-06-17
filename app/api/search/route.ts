import { NextRequest, NextResponse } from "next/server";
import { getConnectorValue } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
}

// GET /api/search?q=appl — ticker/company autocomplete via FMP search-symbol.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ matches: [] });

  const key = getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
  if (!key) return NextResponse.json({ matches: [], note: "no market-data key" });

  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(q)}&limit=10&apikey=${key}`,
      { cache: "no-store" },
    );
    if (!r.ok) return NextResponse.json({ matches: [] });
    const arr = (await r.json()) as any[];
    // Prefer US exchanges (NASDAQ/NYSE/AMEX) first, then others.
    const matches: SymbolMatch[] = (Array.isArray(arr) ? arr : [])
      .map((m) => ({ symbol: m.symbol, name: m.name ?? "", exchange: m.exchange ?? "" }))
      .filter((m) => m.symbol)
      .sort((a, b) => {
        const us = (e: string) => /NASDAQ|NYSE|AMEX/i.test(e);
        return (us(b.exchange) ? 1 : 0) - (us(a.exchange) ? 1 : 0);
      });
    return NextResponse.json({ matches });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}

// POST /api/search { symbol } — validate a single ticker exists (exact-ish).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ valid: false });
  const key = getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
  if (!key) return NextResponse.json({ valid: true, note: "unchecked (no key)" }); // don't block when no key
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(symbol)}&limit=20&apikey=${key}`,
      { cache: "no-store" },
    );
    const arr = (await r.json()) as any[];
    const valid = Array.isArray(arr) && arr.some((m) => String(m.symbol).toUpperCase() === symbol);
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: true, note: "check failed" }); // fail open
  }
}
