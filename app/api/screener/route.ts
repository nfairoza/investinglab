import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { screenStocks } from "@/lib/providers";
import type { ScreenerFilters } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

// GET /api/screener — authed. Maps query params to FMP's screener and returns a
// DataResult<ScreenerRow[]>. Numbers are parsed defensively; bad values dropped.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const numParam = (k: string): number | undefined => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const boolParam = (k: string): boolean | undefined => {
    const v = sp.get(k);
    if (v == null || v === "") return undefined;
    return v === "true" || v === "1";
  };
  const strParam = (k: string): string | undefined => {
    const v = sp.get(k)?.trim();
    return v ? v : undefined;
  };

  const filters: ScreenerFilters = {
    marketCapMoreThan: numParam("marketCapMoreThan"),
    marketCapLowerThan: numParam("marketCapLowerThan"),
    priceMoreThan: numParam("priceMoreThan"),
    priceLowerThan: numParam("priceLowerThan"),
    betaMoreThan: numParam("betaMoreThan"),
    betaLowerThan: numParam("betaLowerThan"),
    volumeMoreThan: numParam("volumeMoreThan"),
    volumeLowerThan: numParam("volumeLowerThan"),
    dividendMoreThan: numParam("dividendMoreThan"),
    sector: strParam("sector"),
    industry: strParam("industry"),
    exchange: strParam("exchange"),
    country: strParam("country"),
    isEtf: boolParam("isEtf"),
    isFund: boolParam("isFund"),
    isActivelyTrading: boolParam("isActivelyTrading"),
    limit: numParam("limit"),
  };

  const result = await screenStocks(filters);
  return NextResponse.json(result);
}
