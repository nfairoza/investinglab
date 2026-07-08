import { marketData } from "@/lib/providers";
import { withFmpFeature } from "@/lib/providers/fmp";
import { getConnectorValue } from "@/lib/connectors/runtime";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { constituents, SECTORS } from "@/lib/market/constituents";
import type { DataResult, Quote } from "@/lib/providers/types";

// =============================================================================
// Stock Map build — runs on the cron, NOT per request. Prices the full S&P 500
// universe into ONE global server_cache entry that every user reads. Period
// returns (5D/1M/6M/1Y) come from stock-price-change, refreshed on a slower
// cadence (6M/1Y barely move intraday). One build serves all users.
//
// Budget-aware: probe the batch-quote endpoint once (probe-and-remember). If ANY
// batch size works, a full build is ~5-10 calls. If per-symbol only, pool at a
// safe concurrency so the rest of the app keeps quote headroom.
// =============================================================================

export const MAP_CACHE_KEY = "map:build";
export const MAP_PERIODS = ["1D", "5D", "1M", "6M", "1Y", "5Y"] as const;
export type MapPeriod = (typeof MAP_PERIODS)[number];

export interface MapTile {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  // Per-period % change; 1D from the quote, others from stock-price-change.
  changes: Partial<Record<MapPeriod, number>>;
  priced: boolean; // false => render as a neutral gray tile, never a fake zero
}

export interface MapBuild {
  tiles: MapTile[];
  sectors: string[];
  builtAt: string;
  pricedCount: number;
  totalCount: number;
  // per-sector "n of m priced" for honest headers
  sectorCounts: Record<string, { priced: number; total: number }>;
}

function fmpKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// stock-price-change field names per period.
const PC_FIELD: Record<Exclude<MapPeriod, "1D">, string> = { "5D": "5D", "1M": "1M", "6M": "6M", "1Y": "1Y", "5Y": "5Y" };

// Read the last built map (what /api/map serves). null if never built.
export async function readMapBuild(): Promise<MapBuild | null> {
  const { value } = await readServerCache<MapBuild>(MAP_CACHE_KEY, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  return value ?? null;
}

// Fetch quotes for the whole universe. getQuotes already probes batch-quote and
// remembers a 4xx (falling back to concurrency-pooled per-symbol) — so this is a
// handful of calls on a batch-capable plan, or pooled per-symbol otherwise.
async function universeQuotes(symbols: string[]): Promise<Record<string, DataResult<Quote>>> {
  return withFmpFeature("map", () => marketData.getQuotes(symbols).catch(() => ({} as Record<string, DataResult<Quote>>)));
}

// Period changes via stock-price-change, concurrency-pooled. `which` limits which
// periods we refresh (6M/1Y run less often — they barely move intraday).
async function priceChanges(symbols: string[], concurrency = 6): Promise<Map<string, any>> {
  const key = fmpKey();
  const out = new Map<string, any>();
  if (!key) return out;
  await withFmpFeature("map", async () => {
    let next = 0;
    async function worker() {
      while (next < symbols.length) {
        const s = symbols[next++];
        try {
          const r = await fetch(`https://financialmodelingprep.com/stable/stock-price-change?symbol=${encodeURIComponent(s)}&apikey=${key}`, { cache: "no-store" });
          if (r.ok) { const arr = await r.json(); out.set(s, Array.isArray(arr) ? arr[0] : arr); }
        } catch { /* leave unpriced for this period */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
  });
  return out;
}

// Build the map. `periods: "fast"` refreshes 1D+quotes only (every build);
// "full" also refreshes all stock-price-change periods (slower cadence). Merges
// period data with the previous build so a fast build keeps prior 6M/1Y values.
export async function buildMap(mode: "fast" | "full" = "full"): Promise<MapBuild> {
  const list = constituents();
  const symbols = list.map((c) => c.symbol);
  const prev = await readMapBuild();
  const prevBySym = new Map((prev?.tiles ?? []).map((t) => [t.symbol, t]));

  const quotes = await universeQuotes(symbols);

  // Period changes: on a full build refresh all; on fast, reuse prior values.
  const pc = mode === "full" ? await priceChanges(symbols) : new Map<string, any>();

  const tiles: MapTile[] = list.map((c) => {
    const q = quotes[c.symbol.toUpperCase()]?.data ?? null;
    const priorTile = prevBySym.get(c.symbol);
    const changes: Partial<Record<MapPeriod, number>> = { ...(priorTile?.changes ?? {}) };
    if (q) changes["1D"] = q.changePct ?? 0;
    const row = pc.get(c.symbol);
    if (row) {
      for (const p of ["5D", "1M", "6M", "1Y", "5Y"] as const) {
        const v = row[PC_FIELD[p]];
        if (typeof v === "number") changes[p] = v;
      }
    }
    const priced = q != null && (q.marketCap ?? 0) > 0;
    return {
      symbol: c.symbol,
      name: q?.name ?? c.name,
      sector: c.sector,
      marketCap: q?.marketCap ?? priorTile?.marketCap ?? 0,
      changes,
      priced: priced || Boolean(priorTile?.priced),
    };
  });

  const sectorCounts: Record<string, { priced: number; total: number }> = {};
  for (const s of SECTORS) sectorCounts[s] = { priced: 0, total: 0 };
  for (const t of tiles) {
    const c = sectorCounts[t.sector] ?? (sectorCounts[t.sector] = { priced: 0, total: 0 });
    c.total += 1;
    if (t.priced) c.priced += 1;
  }

  const build: MapBuild = {
    tiles,
    sectors: SECTORS,
    builtAt: new Date().toISOString(),
    pricedCount: tiles.filter((t) => t.priced).length,
    totalCount: tiles.length,
    sectorCounts,
  };
  await writeServerCache(MAP_CACHE_KEY, build).catch(() => {});
  return build;
}
