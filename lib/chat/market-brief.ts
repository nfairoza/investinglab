import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { marketData, type DataResult, type Quote } from "@/lib/providers";

// =============================================================================
// C6 — daily market brief. A compact, global (not per-user) snapshot of today's
// tape: index moves + a few macro-relevant headlines. Cached in server_cache
// under a global key and refreshed by the cron, so any chat answer can ground
// itself in today's market via the get_market_brief tool instead of stale
// training knowledge.
// =============================================================================

const KEY = "market:brief";
const TTL_MS = 12 * 60 * 60 * 1000; // serve up to 12h; cron refreshes ~daily
const INDEXES = ["SPY", "QQQ", "DIA", "IWM"];

export interface MarketBrief {
  asOf: string;
  indexes: { symbol: string; price: number | null; changePct: number | null }[];
  headlines: { title: string; source: string; url: string; date: string | null }[];
}

// Build a fresh brief (used by the cron). Bounded: one batch quote + one news
// fetch on a bellwether.
export async function buildMarketBrief(nowMs = Date.now()): Promise<MarketBrief> {
  const quotes = await marketData.getQuotes(INDEXES).catch(() => ({} as Record<string, DataResult<Quote>>));
  const indexes = INDEXES.map((s) => {
    const q = quotes[s.toUpperCase()]?.data;
    return { symbol: s, price: q?.price ?? null, changePct: q?.changePct ?? null };
  });
  const news = await marketData.getNews("SPY").catch(() => null);
  const headlines = (news?.data ?? []).slice(0, 6).map((n) => ({
    title: n.title, source: n.source, url: n.url, date: (n as any).publishedAt ?? (n as any).date ?? null,
  }));
  const brief: MarketBrief = { asOf: new Date(nowMs).toISOString(), indexes, headlines };
  await writeServerCache(KEY, brief).catch(() => {});
  return brief;
}

// Read the cached brief (used by the get_market_brief tool). Returns null when
// nothing is cached yet — the tool reports that honestly rather than guessing.
export async function readMarketBrief(): Promise<MarketBrief | null> {
  const { value } = await readServerCache<MarketBrief>(KEY, TTL_MS).catch(() => ({ value: null } as any));
  return value ?? null;
}
