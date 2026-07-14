import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { getTreasuryRates } from "@/lib/providers/fmp";

// MV4 — live-rate grounding. A short-treasury / money-market proxy yield, fetched
// once/day into server_cache with its asOf. Generators read the cached value —
// never per-pageview. If the fetch fails, callers get null and degrade to the
// previous generic phrasing (the rate never blocks an insight).

const CACHE_KEY = "rates:short-treasury";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedRate {
  ratePct: number;
  tenor: string;
  asOf: string | null; // the rate's own date from FMP
  fetchedAt: string; // when we cached it
}

// Read the cached rate (does NOT fetch). Returns null when never cached or the
// provider is plan-restricted — callers degrade gracefully.
export async function readCachedRate(): Promise<CachedRate | null> {
  try {
    const { value } = await readServerCache<CachedRate>(CACHE_KEY, Number.MAX_SAFE_INTEGER);
    return value ?? null;
  } catch {
    return null;
  }
}

// The daily `rates-refresh` cron entry. Fetches the treasury rate and caches it.
// Idempotent; leaves any prior cached value in place on failure.
export async function runRatesRefresh(nowMs = Date.now()): Promise<{ ok: boolean; ratePct: number | null; note: string }> {
  const res = await getTreasuryRates();
  if (!res.data) return { ok: true, ratePct: null, note: res.note ?? "rate unavailable (left prior cache)" };
  const cached: CachedRate = {
    ratePct: res.data.ratePct,
    tenor: res.data.tenor,
    asOf: res.data.asOf,
    fetchedAt: new Date(nowMs).toISOString(),
  };
  await writeServerCache(CACHE_KEY, cached);
  return { ok: true, ratePct: cached.ratePct, note: `${cached.ratePct}% (${cached.tenor}, asOf ${cached.asOf ?? "n/a"})` };
}

export const RATES_CACHE_KEY = CACHE_KEY;
export const RATES_TTL_MS = TTL_MS;
