import { NextRequest, NextResponse } from "next/server";
import { getConnectorValue } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
}

const US = (e: string) => /NASDAQ|NYSE|AMEX/i.test(e);

// GET /api/search?q=micron — autocomplete by TICKER and by COMPANY NAME.
// FMP's search-symbol only matches ticker prefixes; search-name matches company
// names. We query both and merge so "micron" finds MU and "MU" finds MU.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ matches: [] });

  const key = getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
  if (!key) return NextResponse.json({ matches: [], note: "no market-data key" });

  const fetchJson = async (endpoint: string) => {
    try {
      const r = await fetch(
        `https://financialmodelingprep.com/stable/${endpoint}?query=${encodeURIComponent(q)}&limit=15&apikey=${key}`,
        { cache: "no-store" },
      );
      return r.ok ? ((await r.json()) as any[]) : [];
    } catch {
      return [];
    }
  };

  const [bySym, byName] = await Promise.all([fetchJson("search-symbol"), fetchJson("search-name")]);

  // Merge + dedupe by symbol, keep US listings, prefer US exchanges first.
  const seen = new Set<string>();
  const merged: SymbolMatch[] = [];
  for (const m of [...bySym, ...byName]) {
    const symbol = String(m.symbol ?? "").toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    merged.push({ symbol, name: m.name ?? "", exchange: m.exchange ?? "" });
  }
  // US exchanges first; within that, exact-ish ticker matches first.
  const ql = q.toLowerCase();
  merged.sort((a, b) => {
    const usDiff = (US(b.exchange) ? 1 : 0) - (US(a.exchange) ? 1 : 0);
    if (usDiff !== 0) return usDiff;
    const aExact = a.symbol.toLowerCase() === ql ? 1 : 0;
    const bExact = b.symbol.toLowerCase() === ql ? 1 : 0;
    return bExact - aExact;
  });

  return NextResponse.json({ matches: merged.slice(0, 12) });
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
