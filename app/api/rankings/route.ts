import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { computeScore, type StockScore } from "@/lib/scoring/score";
import { getUserClient } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";

export const dynamic = "force-dynamic";

// Seed universe (mirrors the client's old SEED) + the user's holdings/watchlist.
const SEED = ["AAPL","MSFT","NVDA","AMD","GOOGL","AMZN","META","TSLA","AVGO","JPM","V","COST","NFLX","CRM","ADBE","QCOM"];

// Score the whole universe SERVER-SIDE with bounded concurrency so we don't fire
// 60+ FMP calls in one instant (which 429s the plan and left Rankings empty).
// The whole result is cached process-wide for 5 min — Rankings is the same for
// everyone modulo their own tickers, and prices don't move minute-to-minute.
type Cached = { at: number; scores: StockScore[]; source: "live" | "demo" | "unavailable" };
const cache = new Map<string, Cached>();
const TTL_MS = 5 * 60_000;

async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Build the universe: seed + holdings + watchlist (deduped).
  const [holdings, { data: wl }] = await Promise.all([
    getUnifiedHoldings(ctx.supabase, { realTickersOnly: true }).catch(() => []),
    ctx.supabase.from("watch_list_items").select("symbol"),
  ]);
  const extra = [...holdings.map((h) => h.symbol), ...((wl ?? []).map((w: any) => String(w.symbol).toUpperCase()))];
  const universe = Array.from(new Set([...SEED, ...extra]));

  const cacheK = universe.slice().sort().join(",");
  const hit = cache.get(cacheK);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ scores: hit.scores, source: hit.source, cached: true });
  }

  // Concurrency cap of 4 keeps us comfortably under FMP's per-minute rate limit;
  // the provider also caches 90s + dedupes, so repeats are nearly free.
  let source: "live" | "demo" | "unavailable" = "unavailable";
  const results = await pool(universe, 4, async (sym) => {
    try {
      const [quote, financials, technicals, earnings] = await Promise.all([
        marketData.getQuote(sym),
        marketData.getFinancials(sym),
        marketData.getTechnicals(sym),
        marketData.getEarningsDate(sym),
      ]);
      if (!quote.data) return null;
      if (quote.source === "live") source = "live";
      else if (quote.source === "demo" && source !== "live") source = "demo";
      return computeScore({ quote: quote.data, financials: financials.data, technicals: technicals.data, earnings: earnings.data });
    } catch { return null; }
  });
  const scores = results.filter((x): x is StockScore => x != null);

  if (scores.length) cache.set(cacheK, { at: Date.now(), scores, source });
  return NextResponse.json({ scores, source, cached: false });
}
