import { NextRequest, NextResponse } from "next/server";
import { etfData } from "@/lib/providers";
import type { EtfInfo, EtfHolding, EtfWeight } from "@/lib/providers/types";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { isDailyStale } from "@/lib/daily-cache";
import { detectLeverage, isSwapBased } from "@/lib/etf/classify";

export const dynamic = "force-dynamic";

// GET /api/etf?symbol=SOXL — all ETF datasets for a symbol, cached 24h globally
// (an ETF's holdings/weights aren't personal). Each dataset is probe-and-remember
// at the provider layer, so a plan-tiered endpoint returns a plan-notice instead
// of failing the whole page. Leverage + swap-based classification is deterministic.
export interface EtfPayload {
  symbol: string;
  info: { data: EtfInfo | null; note?: string };
  holdings: { data: EtfHolding[] | null; note?: string };
  sectors: { data: EtfWeight[] | null; note?: string };
  countries: { data: EtfWeight[] | null; note?: string };
  leverage: ReturnType<typeof detectLeverage>;
  swap: ReturnType<typeof isSwapBased>;
  generatedAt: string;
}

const key = (symbol: string) => `etf:page:${symbol.toUpperCase()}`;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const name = req.nextUrl.searchParams.get("name") ?? null; // profile name for leverage detection

  const cacheKey = key(symbol);
  const cached = await readServerCache<EtfPayload>(cacheKey, 24 * 60 * 60 * 1000);
  if (cached.value && !isDailyStale(cached.generatedAt)) {
    return NextResponse.json({ ...cached.value, cached: true });
  }

  const [info, holdings, sectors, countries] = await Promise.all([
    etfData.info(symbol),
    etfData.holdings(symbol),
    etfData.sectorWeights(symbol),
    etfData.countryWeights(symbol),
  ]);

  // Leverage from the profile name (passed in) OR the ETF's own name.
  const leverage = detectLeverage(name ?? info.data?.name ?? null);
  const swap = isSwapBased(holdings.data);

  const payload: EtfPayload = {
    symbol,
    info: { data: info.data, note: info.data ? undefined : (info.note ?? undefined) },
    holdings: { data: holdings.data, note: holdings.data ? undefined : (holdings.note ?? undefined) },
    sectors: { data: sectors.data, note: sectors.data ? undefined : (sectors.note ?? undefined) },
    countries: { data: countries.data, note: countries.data ? undefined : (countries.note ?? undefined) },
    leverage,
    swap,
    generatedAt: new Date().toISOString(),
  };
  await writeServerCache(cacheKey, payload);
  return NextResponse.json({ ...payload, cached: false });
}
