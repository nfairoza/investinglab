import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { getConnectorValue } from "@/lib/connectors/runtime";

export const dynamic = "force-dynamic";

// Timeline periods the map can color by. "1D" uses the live quote's day move;
// the rest come from FMP's stock-price-change endpoint (one call/symbol, cached).
const PERIODS = ["1D", "5D", "1M", "6M", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];
// Map our period -> the field name FMP's stock-price-change returns.
const FMP_FIELD: Record<Exclude<Period, "1D">, string> = {
  "5D": "5D", "1M": "1M", "6M": "6M", "1Y": "1Y", "5Y": "5Y",
};

function fmpKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// Short cache of stock-price-change responses so flipping periods is cheap.
const PC_TTL = 5 * 60_000;
const pcCache = new Map<string, { at: number; data: any }>();

async function priceChange(symbol: string): Promise<any | null> {
  const key = fmpKey();
  if (!key) return null;
  const hit = pcCache.get(symbol);
  if (hit && Date.now() - hit.at < PC_TTL) return hit.data;
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/stock-price-change?symbol=${symbol}&apikey=${key}`, { cache: "no-store" });
    if (!r.ok) return null;
    const arr = await r.json();
    const row = Array.isArray(arr) ? arr[0] : arr;
    pcCache.set(symbol, { at: Date.now(), data: row });
    return row ?? null;
  } catch {
    return null;
  }
}

interface BatchQuote { name?: string; marketCap?: number; changePct?: number }

// Run async jobs with a concurrency cap. FMP's batch-quote endpoint is premium
// ("Restricted" on this plan), so we still fetch per-symbol — but firing all
// ~110 at once trips the per-minute RATE limit (which showed the map as
// "Unavailable"). Capping concurrency keeps us under the limit while staying
// fast; the provider already caches each quote 90s + retries transient 429s.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function batchQuotes(symbols: string[]): Promise<Map<string, BatchQuote>> {
  const out = new Map<string, BatchQuote>();
  if (!fmpKey()) return out;
  const results = await mapPool(symbols, 8, (s) => marketData.getQuote(s).catch(() => null));
  symbols.forEach((s, i) => {
    const q = results[i]?.data;
    if (q) out.set(s, { name: q.name ?? s, marketCap: q.marketCap ?? 0, changePct: q.changePct ?? 0 });
  });
  return out;
}

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

export async function GET(req: NextRequest) {
  // Map symbol -> sector for the curated universe.
  const sectorOf = new Map<string, string>();
  for (const [sector, syms] of Object.entries(UNIVERSE)) {
    for (const s of syms) sectorOf.set(s, sector);
  }

  // Selected timeline period (defaults to 1-day).
  const periodRaw = (req.nextUrl.searchParams.get("period") ?? "1D").toUpperCase();
  const period: Period = (PERIODS as readonly string[]).includes(periodRaw) ? (periodRaw as Period) : "1D";

  // Optional extra tickers (e.g. the user's holdings) so "My Holdings" can show
  // names that aren't in the curated large-cap universe.
  const extra = (req.nextUrl.searchParams.get("extra") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    .filter((s) => !sectorOf.has(s));
  const targets: { symbol: string; sector: string }[] = [
    ...Array.from(sectorOf.entries()).map(([symbol, sector]) => ({ symbol, sector })),
    ...extra.map((symbol) => ({ symbol, sector: "My Holdings" })),
  ];

  // ONE batched quote call for the whole universe instead of ~110 individual
  // requests — far faster and avoids tripping FMP's per-minute rate limit (which
  // was showing the map as "Unavailable"). FMP /stable/quote accepts a
  // comma-separated symbol list.
  const quotes = await batchQuotes(targets.map((t) => t.symbol));

  // Period returns: only needed for non-1D windows. Still per-symbol (cached 5m),
  // but capped in concurrency so a period flip doesn't fire 110 calls at once.
  const pcBySym = new Map<string, any>();
  if (period !== "1D") {
    const syms = targets.map((t) => t.symbol);
    const CONCURRENCY = 8;
    for (let i = 0; i < syms.length; i += CONCURRENCY) {
      const batch = syms.slice(i, i + CONCURRENCY);
      const rows = await Promise.all(batch.map((s) => priceChange(s)));
      batch.forEach((s, j) => pcBySym.set(s, rows[j]));
    }
  }

  const nodes = targets.map(({ symbol, sector }) => {
    const q = quotes.get(symbol);
    if (!q) return null;
    const pc = pcBySym.get(symbol);
    const changePct =
      period === "1D"
        ? (q.changePct ?? 0)
        : (pc && typeof pc[FMP_FIELD[period as Exclude<Period, "1D">]] === "number"
            ? pc[FMP_FIELD[period as Exclude<Period, "1D">]]
            : (q.changePct ?? 0));
    return {
      symbol,
      name: q.name ?? symbol,
      sector,
      marketCap: q.marketCap ?? 0,
      changePct,
    } as MapNode;
  }).filter((n): n is MapNode => n != null && n.marketCap > 0);
  // source is "live" if we got real data, else demo
  const anyLive = nodes.length > 0;
  return NextResponse.json({
    nodes,
    sectors: Object.keys(UNIVERSE),
    period,
    periods: PERIODS,
    source: anyLive ? "live" : "unavailable",
    asOf: new Date().toISOString(),
  });
}
