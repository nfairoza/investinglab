import {
  MarketDataProvider,
  DataResult,
  Quote,
  Financials,
  NewsItem,
  EarningsDate,
  Technicals,
  CompanyProfile,
  AnalystData,
  InsiderTrade,
  DcfValue,
  PriceHistory,
  ScreenerRow,
  ScreenerFilters,
  EtfInfo,
  EtfHolding,
  EtfWeight,
  live,
  unavailable,
} from "./types";
import { getConnectorValue } from "@/lib/connectors/runtime";
import { readServerCache, writeServerCache } from "@/lib/server-cache";

// =============================================================================
// Financial Modeling Prep adapter — uses the STABLE API.
//
// FMP retired the legacy /api/v3 + /api/v4 endpoints on 2025-08-31. Keys issued
// after that only work against https://financialmodelingprep.com/stable/*,
// which uses ?symbol= query params instead of /SYMBOL path segments.
//
// Free-tier note: quotes, financials, earnings, profile, analyst targets, DCF,
// and peers work on the free plan. Live technical-indicator, insider-trading,
// and news endpoints return HTTP 402 (paid only) — we degrade those to
// "unavailable" rather than failing the whole app, and derive moving averages
// from the quote's priceAvg50/priceAvg200 fields so scoring still works.
//
// The key is read at CALL TIME so a key added in the Connectors UI works at once.
// =============================================================================

const NAME = "Financial Modeling Prep";
const BASE = "https://financialmodelingprep.com/stable";

export function getKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// ── Response cache ──────────────────────────────────────────────────────────
// FMP free tier = 250 calls/day. The app fires several calls per page, so we
// cache successful responses per-URL. Two layers:
//   L1 — this in-memory map (fast, per serverless instance, lost on cold start)
//   L2 — durable server_cache table, for the slow-changing NON-quote endpoints
//        (financials/ratios/DCF/profile/price-history) so a cold start doesn't
//        re-hit FMP. Quotes stay MEMORY-ONLY so prices never come from a stale
//        shared row.
// Keyed by the URL WITHOUT the apikey so the key never lives in the cache keys.
const CACHE_TTL_MS = 90_000; // default: quotes feel live, but repeat views are free
interface CacheEntry { at: number; data: unknown; ttl: number }
const cache = new Map<string, CacheEntry>();

// Simple max-entries bound (~500) with oldest-first (insertion-order) eviction,
// so a long-lived instance can't grow either map without limit.
const MAX_ENTRIES = 500;
function boundedSet<V>(map: Map<string, V>, key: string, value: V): void {
  if (map.size >= MAX_ENTRIES && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

// Per-endpoint TTLs (P3): quotes churn intraday; fundamentals/profile rarely do,
// so cache them far longer to slash FMP calls. Matched by URL substring.
const ENDPOINT_TTL_MS: Array<{ match: RegExp; ttl: number }> = [
  { match: /\/(batch-)?quote\b/, ttl: 60_000 },                // 60s
  { match: /\/(income-statement|cash-flow-statement|balance-sheet|ratios|key-metrics|financial-growth|discounted-cash-flow|historical-price-eod)\b/, ttl: 24 * 60 * 60 * 1000 }, // 24h
  { match: /\/(profile|company-outlook)\b/, ttl: 7 * 24 * 60 * 60 * 1000 }, // 7d
  { match: /\/etf\//, ttl: 24 * 60 * 60 * 1000 }, // 24h — ETF info/holdings/weightings change slowly
];

function ttlFor(url: string): number {
  return ENDPOINT_TTL_MS.find((e) => e.match.test(url))?.ttl ?? CACHE_TTL_MS;
}

// Quotes are the only price-sensitive, fast-moving data: they stay memory-only
// (no durable L2) and refresh by BLOCKING so a served price is never stale. Every
// other endpoint gets L2 + stale-while-revalidate.
function isQuoteUrl(url: string): boolean {
  return /\/(batch-)?quote\b/.test(url);
}

function cacheKey(url: string): string {
  return url.replace(/([?&])apikey=[^&]*/i, "$1apikey=__");
}

// Drop all cached FMP responses so the next call hits the API fresh. Used by the
// "Clear cache & refresh" action in Settings (e.g. when day-change drifts vs a
// broker before the TTL expires). Also clears in-flight so a stuck request can't
// pin a stale entry.
export function clearFmpCache(): number {
  const n = cache.size;
  cache.clear();
  inflight.clear();
  return n;
}

// Thrown only when FMP's body explicitly says the quota is exhausted (true
// daily cap). A bare 429 is a transient per-minute RATE limit — we retry those
// instead, so a burst of parallel calls on a research page doesn't flash a scary
// "limit reached" before the data loads.
class FmpLimitError extends Error {
  status = 429;
  constructor() {
    super("FMP plan limit reached — you've hit your API quota. It resets per your FMP plan, or upgrade for more calls.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Provider health (P3.3) ──────────────────────────────────────────────────
// Lightweight in-memory counters for the /connectors health strip: last success,
// last error, and today's ACTUAL network call count (cache hits don't count),
// broken down BY FEATURE so we can see e.g. the Stock Map's daily consumption vs
// the plan limit. Per serverless instance (best-effort) — resets on cold start.
interface FmpHealth {
  lastSuccess: string | null; lastError: string | null; lastErrorAt: string | null;
  callsToday: number; byFeature: Record<string, number>; day: string;
}
const health: FmpHealth = { lastSuccess: null, lastError: null, lastErrorAt: null, callsToday: 0, byFeature: {}, day: "" };

function today(): string { return new Date().toISOString().slice(0, 10); }

// Feature attribution. Callers set the current feature around a burst of calls
// (e.g. the map build) via withFmpFeature(); untagged calls bucket as "app".
let currentFeature = "app";
export function withFmpFeature<T>(feature: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentFeature;
  currentFeature = feature;
  return fn().finally(() => { currentFeature = prev; });
}

function recordCall(): void {
  const d = today();
  if (health.day !== d) { health.day = d; health.callsToday = 0; health.byFeature = {}; }
  health.callsToday += 1;
  health.byFeature[currentFeature] = (health.byFeature[currentFeature] ?? 0) + 1;
}
export function fmpHealth(): FmpHealth {
  if (health.day !== today()) return { ...health, callsToday: 0, byFeature: {} };
  return { ...health, byFeature: { ...health.byFeature } };
}

// In-flight request map: collapses duplicate CONCURRENT calls for the same URL
// into a single HTTP request. The fresh cache only fills after a response
// returns, so without this two callers firing at the same instant (e.g. the
// Research page and the score route both wanting the same symbol's quote) each
// make their own network call. Keyed like the cache (apikey stripped). Also
// doubles as the "one background refresh in flight" guard for SWR.
const inflight = new Map<string, Promise<unknown>>();

// Durable L2 for the slow-changing non-quote endpoints. Value mirrors the L1
// CacheEntry so freshness is computed the same way (from `at`), independent of
// server_cache's own 8am-ET staleness (we read the value, not its stale flag).
function l2Key(key: string): string { return `fmp:${key}`; }
async function readL2(key: string): Promise<CacheEntry | null> {
  try {
    const { value } = await readServerCache<CacheEntry>(l2Key(key), Number.MAX_SAFE_INTEGER);
    return value && typeof value.at === "number" && typeof value.ttl === "number" ? value : null;
  } catch { return null; }
}
function writeL2(key: string, entry: CacheEntry): void {
  // Fire-and-forget: a failed durable write must never break the live response.
  writeServerCache(l2Key(key), entry).catch(() => {});
}

// Stale-while-revalidate: serve the stale value now, refresh in the background.
// Deduped through `inflight` so no matter how many callers hit the stale entry,
// EXACTLY ONE background refresh runs at a time.
function scheduleRefresh(url: string): void {
  const key = cacheKey(url);
  if (inflight.has(key)) return;
  const p = fetchJsonUncached(url, 0)
    .catch(() => {}) // background failure keeps the stale value; surfaced on next blocking call
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
}

// Fetch JSON with L1+L2 caching, in-flight dedup, stale-while-revalidate (for
// non-quote endpoints), and retry-on-rate-limit. Throws with .status so callers
// can distinguish 402 (paid-only), 429 (limit), and other failures.
//
// Quotes are memory-only and refresh by BLOCKING (prices must be live). Every
// other endpoint is L2-backed and serves stale immediately while revalidating.
async function getJson(url: string, attempt = 0): Promise<unknown> {
  const key = cacheKey(url);
  const now = Date.now();
  const quote = isQuoteUrl(url);

  // attempt > 0 is an internal retry — skip cache/dedup, go straight to network.
  if (attempt > 0) return fetchJsonUncached(url, attempt);

  const hit = cache.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.data; // fresh L1
  if (hit && !quote) { scheduleRefresh(url); return hit.data; } // stale L1 → SWR

  // Only the first concurrent caller starts a blocking request; the rest await it.
  const pending = inflight.get(key);
  if (pending) return pending;

  // Non-quote L1 miss → consult durable L2 before hitting the network.
  if (!quote) {
    const l2 = await readL2(key);
    if (l2) {
      boundedSet(cache, key, l2); // hydrate L1
      if (now - l2.at < l2.ttl) return l2.data; // fresh from L2
      scheduleRefresh(url); // stale L2 → serve stale + revalidate
      return l2.data;
    }
  }

  // Nothing usable cached (or a quote) → blocking fetch.
  const p = fetchJsonUncached(url, attempt).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

async function fetchJsonUncached(url: string, attempt: number): Promise<unknown> {
  const key = cacheKey(url);
  if (attempt === 0) recordCall(); // count only the first attempt as one logical call
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  // Body literally says the quota is exhausted → real (daily/plan) limit.
  if (/limit reach/i.test(text)) {
    health.lastError = "plan/quota limit reached"; health.lastErrorAt = new Date().toISOString();
    throw new FmpLimitError();
  }

  // Bare 429 = transient per-minute rate limit (common when a page fires many
  // calls at once). Retry up to 3x with backoff before giving up.
  if (res.status === 429) {
    if (attempt < 3) { await sleep(350 * (attempt + 1)); return getJson(url, attempt + 1); }
    health.lastError = "rate limit (429)"; health.lastErrorAt = new Date().toISOString();
    throw new FmpLimitError();
  }
  if (!res.ok) {
    health.lastError = `HTTP ${res.status}`; health.lastErrorAt = new Date().toISOString();
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }

  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  const entry: CacheEntry = { at: Date.now(), data, ttl: ttlFor(url) };
  boundedSet(cache, key, entry);
  if (!isQuoteUrl(url)) writeL2(key, entry); // durable L2 for slow-changing data only
  health.lastSuccess = new Date().toISOString();
  return data;
}

// ── Test hooks (P5) ───────────────────────────────────────────────────────────
// Only used by tests/fmp-cache.test.ts to exercise the SWR path deterministically.
export const __fmpTest = {
  getJson,
  primeCache(url: string, data: unknown, ageMs: number, ttlMs: number): void {
    boundedSet(cache, cacheKey(url), { at: Date.now() - ageMs, data, ttl: ttlMs });
  },
  peek(url: string): CacheEntry | undefined { return cache.get(cacheKey(url)); },
  async flush(): Promise<void> { await Promise.all([...inflight.values()]); },
  reset(): void { cache.clear(); inflight.clear(); },
};

// MACD histogram (EMA12 − EMA26, minus EMA9 of that line) from oldest→newest
// closes. Returns the latest histogram value, or null if not enough data.
function computeMacdHist(closes: number[]): number | null {
  if (closes.length < 35) return null;
  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const out: number[] = [];
    let prev = data[0];
    for (let i = 0; i < data.length; i++) {
      prev = i === 0 ? data[0] : data[i] * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signal = ema(macdLine, 9);
  const last = closes.length - 1;
  return macdLine[last] - signal[last];
}

// Map a raw FMP quote object to our Quote shape (shared by getQuote + getQuotes).
function mapQuote(q: any, symbol: string): Quote {
  return {
    symbol: q.symbol ?? symbol,
    name: q.name ?? symbol,
    price: q.price,
    change: q.change ?? 0,
    changePct: q.changePercentage ?? 0,
    marketCap: q.marketCap ?? null,
    volume: q.volume ?? null,
    week52High: q.yearHigh ?? null,
    week52Low: q.yearLow ?? null,
    currency: "USD",
  };
}

// ── Batch-quote failure memo ──────────────────────────────────────────────────
// FMP's batch-quote endpoint is plan-restricted on some tiers (4xx). Once we see
// that, remember it durably for 24h so we skip batch and go straight to the
// per-symbol path on every request instead of eating a 4xx each time. Backed by
// server_cache (survives cold starts) with an in-memory shortcut.
const BATCH_DISABLED_KEY = "fmp:batch-quote-disabled";
const BATCH_DISABLED_TTL_MS = 24 * 60 * 60 * 1000;
let batchDisabledUntilMem = 0;

async function batchQuoteDisabled(): Promise<boolean> {
  if (Date.now() < batchDisabledUntilMem) return true;
  try {
    const { value } = await readServerCache<{ until: number }>(BATCH_DISABLED_KEY, Number.MAX_SAFE_INTEGER);
    if (value && typeof value.until === "number" && Date.now() < value.until) {
      batchDisabledUntilMem = value.until;
      return true;
    }
  } catch { /* ignore — treat as not-disabled */ }
  return false;
}

async function disableBatchQuote(status: number): Promise<void> {
  const until = Date.now() + BATCH_DISABLED_TTL_MS;
  batchDisabledUntilMem = until;
  health.lastError = `batch-quote HTTP ${status} — using per-symbol for 24h`;
  health.lastErrorAt = new Date().toISOString();
  try { await writeServerCache(BATCH_DISABLED_KEY, { until }); } catch { /* memory memo still holds */ }
}

// Concurrency-pooled per-symbol quote fallback. Runs getQuote across a small pool
// so we don't fire N requests at once (which would trip the per-minute 429s the
// batch endpoint was meant to avoid), but still resolve a whole watchlist fast.
async function perSymbolQuotes(
  provider: Pick<MarketDataProvider, "getQuote">,
  symbols: string[],
): Promise<Record<string, DataResult<Quote>>> {
  const out: Record<string, DataResult<Quote>> = {};
  const POOL = 6;
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < symbols.length) {
      const s = symbols[idx++];
      out[s] = await provider.getQuote(s);
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, symbols.length) }, worker));
  return out;
}

export const fmpProvider: MarketDataProvider = {
  name: NAME,

  async getQuote(symbol): Promise<DataResult<Quote>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/quote?symbol=${symbol}&apikey=${KEY}`)) as any[];
      const q = Array.isArray(arr) ? arr[0] : null;
      if (!q) return unavailable(NAME, "No quote returned for " + symbol);
      const asOf = q.timestamp ? new Date(q.timestamp * 1000).toISOString() : undefined;
      return live(NAME, mapQuote(q, symbol), asOf);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "quote fetch failed");
    }
  },

  // Batch quotes (P3): one HTTP call for many symbols via FMP's batch-quote
  // endpoint, instead of N single-quote calls (which trip the per-minute 429s on
  // watchlist/rankings/screener). Returns a per-symbol DataResult map; symbols
  // FMP omits come back as "unavailable" so callers see honest gaps.
  //
  // Resilience: FMP's batch-quote endpoint is plan-restricted on some tiers and
  // returns a 4xx. When that happens we DON'T degrade quotes to "unavailable" —
  // we fall back to the per-symbol /quote endpoint (concurrency-pooled), and
  // remember the batch failure in the durable cache for 24h so every subsequent
  // request skips batch and goes straight to per-symbol (no wasted 4xx round-trip
  // on each call).
  async getQuotes(symbols): Promise<Record<string, DataResult<Quote>>> {
    const KEY = getKey();
    const out: Record<string, DataResult<Quote>> = {};
    const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean)));
    if (!KEY) { for (const s of uniq) out[s] = unavailable(NAME, "MARKET_DATA_API_KEY missing"); return out; }
    if (uniq.length === 0) return out;

    // If batch is known-broken (memoized on a prior 4xx), skip it entirely.
    if (await batchQuoteDisabled()) return perSymbolQuotes(this, uniq);

    // FMP caps batch size; chunk to stay safe.
    const CHUNK = 50;
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const chunk = uniq.slice(i, i + CHUNK);
      try {
        const arr = (await getJson(`${BASE}/batch-quote?symbols=${chunk.join(",")}&apikey=${KEY}`)) as any[];
        const bySym = new Map<string, any>((Array.isArray(arr) ? arr : []).map((q) => [String(q.symbol).toUpperCase(), q]));
        for (const s of chunk) {
          const q = bySym.get(s);
          if (!q) { out[s] = unavailable(NAME, "No quote returned for " + s); continue; }
          out[s] = live(NAME, mapQuote(q, s), q.timestamp ? new Date(q.timestamp * 1000).toISOString() : undefined);
        }
      } catch (e) {
        const status = (e as { status?: number })?.status;
        // 4xx (except 429 quota, which is a real limit both paths share): batch
        // is plan-restricted / unsupported. Memoize + fall back to per-symbol for
        // ALL remaining symbols — quotes must degrade to per-symbol, never to
        // "unavailable", when the single-quote endpoint still works.
        if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
          await disableBatchQuote(status);
          const remaining = uniq.slice(i); // this chunk + everything after
          Object.assign(out, await perSymbolQuotes(this, remaining));
          return out;
        }
        const msg = e instanceof Error ? e.message : "batch quote fetch failed";
        for (const s of chunk) out[s] = unavailable(NAME, msg);
      }
    }
    return out;
  },

  async getFinancials(symbol): Promise<DataResult<Financials>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const [income, cash] = await Promise.all([
        getJson(`${BASE}/income-statement?symbol=${symbol}&period=quarter&limit=8&apikey=${KEY}`),
        getJson(`${BASE}/cash-flow-statement?symbol=${symbol}&period=quarter&limit=8&apikey=${KEY}`).catch(() => []),
      ]);
      const inc = income as any[];
      if (!Array.isArray(inc) || inc.length === 0) return unavailable(NAME, "No financials");
      const fcfByDate = new Map<string, number>();
      if (Array.isArray(cash)) for (const c of cash as any[]) fcfByDate.set(c.date, c.freeCashFlow);
      const quarters = inc
        .slice()
        .reverse()
        .map((r: any) => ({
          period: r.fiscalYear && r.period ? `${r.fiscalYear}-${r.period}` : r.date,
          revenue: r.revenue ?? null,
          netIncome: r.netIncome ?? null,
          eps: r.epsDiluted ?? r.eps ?? null,
          grossMarginPct: r.revenue ? (r.grossProfit / r.revenue) * 100 : null,
          operatingMarginPct: r.revenue && r.operatingIncome != null ? (r.operatingIncome / r.revenue) * 100 : null,
          freeCashFlow: fcfByDate.get(r.date) ?? null,
        }));
      return live(NAME, { symbol, quarters });
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "financials fetch failed");
    }
  },

  async getNews(symbol): Promise<DataResult<NewsItem[]>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/news/stock?symbols=${symbol}&limit=20&apikey=${KEY}`)) as any[];
      if (!Array.isArray(arr)) return unavailable(NAME, "No news");
      const items: NewsItem[] = arr.map((n: any) => ({
        title: n.title,
        url: n.url,
        source: n.publisher ?? n.site ?? "",
        publishedAt: n.publishedDate ?? n.date ?? "",
        summary: n.text,
      }));
      return live(NAME, items);
    } catch (e) {
      if ((e as { status?: number })?.status === 402) return unavailable(NAME, "News requires a paid FMP plan");
      return unavailable(NAME, e instanceof Error ? e.message : "news fetch failed");
    }
  },

  async getEarningsDate(symbol): Promise<DataResult<EarningsDate>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/earnings-calendar?symbol=${symbol}&apikey=${KEY}`)) as any[];
      const today = new Date().toISOString().slice(0, 10);
      const future = Array.isArray(arr)
        ? arr.map((e: { date: string }) => e.date as string).filter((d) => d >= today).sort()
        : [];
      return live(NAME, { symbol, next: future[0] ?? null });
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "earnings fetch failed");
    }
  },

  // Real technical indicators (Starter+ plan). Pulls the SMA-50, SMA-200 and
  // RSI-14 series; the latest value of each feeds the scoring engine, and the
  // SMA series overlay the moving-average chart. Falls back to the quote's
  // priceAvg50/200 if an indicator call fails, so this degrades gracefully.
  async getTechnicals(symbol): Promise<DataResult<Technicals>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    const tech = (type: string, period: number) =>
      `${BASE}/technical-indicators/${type}?symbol=${symbol}&periodLength=${period}&timeframe=1day&apikey=${KEY}`;
    try {
      const [sma50Raw, sma200Raw, rsiRaw, quoteArr, ratiosArr, gradesArr] = await Promise.all([
        getJson(tech("sma", 50)).catch(() => []),
        getJson(tech("sma", 200)).catch(() => []),
        getJson(tech("rsi", 14)).catch(() => []), // rsi endpoint also returns OHLC closes
        getJson(`${BASE}/quote?symbol=${symbol}&apikey=${KEY}`).catch(() => []),
        getJson(`${BASE}/ratios-ttm?symbol=${symbol}&apikey=${KEY}`).catch(() => []),
        getJson(`${BASE}/grades?symbol=${symbol}&apikey=${KEY}`).catch(() => []),
      ]);
      const head = (a: unknown) => (Array.isArray(a) && a[0] ? a[0] : null);
      // series: newest-first from FMP → reverse to oldest→newest, cap to ~250 pts
      const toSeries = (a: unknown) =>
        Array.isArray(a)
          ? (a as any[]).slice(0, 250).reverse().map((p) => ({ date: String(p.date).slice(0, 10), value: p.sma }))
          : [];

      // Fall back to quote averages if the indicator endpoints returned nothing.
      const q = Array.isArray(quoteArr) ? quoteArr[0] : null;
      let sma50 = head(sma50Raw)?.sma ?? null;
      let sma200 = head(sma200Raw)?.sma ?? null;
      sma50 = sma50 ?? q?.priceAvg50 ?? null;
      sma200 = sma200 ?? q?.priceAvg200 ?? null;

      // MACD: FMP's macd indicator endpoint is unavailable on this plan, so we
      // compute the MACD histogram (EMA12 − EMA26, minus its EMA9 signal) from
      // the daily closes the RSI endpoint returns (newest-first → oldest-first).
      const closes = Array.isArray(rsiRaw)
        ? (rsiRaw as any[]).map((p) => Number(p.close)).filter((n) => Number.isFinite(n)).reverse()
        : [];
      const macd = computeMacdHist(closes);

      // Debt/equity from TTM ratios.
      const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : null;
      const debtToEquity = ratios?.debtToEquityRatioTTM ?? ratios?.debtEquityRatioTTM ?? null;

      // Latest analyst upgrade/downgrade.
      const g = Array.isArray(gradesArr) ? gradesArr[0] : null;
      const analystAction = g
        ? { action: g.action ?? "", firm: g.gradingCompany ?? "", date: g.date ?? "" }
        : null;

      const t: Technicals = {
        symbol,
        sma50,
        sma200,
        rsi14: head(rsiRaw)?.rsi ?? null,
        macd,
        volume: q?.volume ?? null,
        avgVolume: q?.avgVolume ?? null,
        debtToEquity: typeof debtToEquity === "number" ? debtToEquity : null,
        analystAction,
        sma50Series: toSeries(sma50Raw),
        sma200Series: toSeries(sma200Raw),
      };
      return live(NAME, t);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "technicals fetch failed");
    }
  },

  async getCompanyProfile(symbol): Promise<DataResult<CompanyProfile>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const [profileArr, peersArr] = await Promise.all([
        getJson(`${BASE}/profile?symbol=${symbol}&apikey=${KEY}`),
        getJson(`${BASE}/stock-peers?symbol=${symbol}&apikey=${KEY}`).catch(() => []),
      ]);
      const p = Array.isArray(profileArr) ? profileArr[0] : null;
      if (!p) return unavailable(NAME, "No profile for " + symbol);
      // stable stock-peers returns an array of { symbol, companyName, ... }
      const peers: string[] = Array.isArray(peersArr)
        ? (peersArr as any[]).map((x) => x.symbol).filter(Boolean).slice(0, 10)
        : [];
      const profile: CompanyProfile = {
        symbol: p.symbol,
        name: p.companyName ?? symbol,
        description: p.description ?? "",
        sector: p.sector ?? null,
        industry: p.industry ?? null,
        ceo: p.ceo ?? null,
        employees: p.fullTimeEmployees ? Number(p.fullTimeEmployees) : null,
        website: p.website ?? null,
        exchange: p.exchangeShortName ?? p.exchange ?? null,
        marketCap: p.marketCap ?? p.mktCap ?? null,
        beta: p.beta ?? null,
        ipoDate: p.ipoDate ?? null,
        peers,
        isEtf: Boolean(p.isEtf),
        isFund: Boolean(p.isFund),
      };
      return live(NAME, profile);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "profile fetch failed");
    }
  },

  async getAnalystData(symbol): Promise<DataResult<AnalystData>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const [targetSummary, targetConsensus, gradesConsensus] = await Promise.all([
        getJson(`${BASE}/price-target-summary?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
        getJson(`${BASE}/price-target-consensus?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
        getJson(`${BASE}/grades-consensus?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
      ]);

      const ts = Array.isArray(targetSummary) ? targetSummary[0] : (targetSummary as any);
      const tc = Array.isArray(targetConsensus) ? targetConsensus[0] : (targetConsensus as any);
      const gs = Array.isArray(gradesConsensus) ? gradesConsensus[0] : (gradesConsensus as any);

      // price-target-consensus carries high/low/consensus/median; price-target-summary
      // carries recent rolling averages. Prefer the consensus endpoint, fall back to summary.
      const consensus = tc?.targetConsensus ?? ts?.lastQuarterAvgPriceTarget ?? ts?.lastYearAvgPriceTarget ?? null;

      const analyst: AnalystData = {
        symbol,
        priceTargetHigh: tc?.targetHigh ?? null,
        priceTargetLow: tc?.targetLow ?? null,
        priceTargetConsensus: consensus,
        priceTargetAvg: ts?.lastQuarterAvgPriceTarget ?? ts?.lastYearAvgPriceTarget ?? tc?.targetMedian ?? null,
        strongBuy: gs?.strongBuy ?? 0,
        buy: gs?.buy ?? 0,
        hold: gs?.hold ?? 0,
        sell: gs?.sell ?? 0,
        strongSell: gs?.strongSell ?? 0,
        latestGrade: gs?.consensus
          ? { date: "", firm: "Consensus", action: "", fromGrade: "", toGrade: gs.consensus }
          : undefined,
      };
      return live(NAME, analyst);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "analyst data fetch failed");
    }
  },

  async getInsiderTrades(symbol): Promise<DataResult<InsiderTrade[]>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/insider-trading/search?symbol=${symbol}&page=0&limit=100&apikey=${KEY}`)) as any[];
      if (!Array.isArray(arr)) return unavailable(NAME, "No insider trades");
      const trades: InsiderTrade[] = arr.map((t: any) => ({
        symbol,
        date: t.transactionDate ?? t.filingDate ?? "",
        filingDate: t.filingDate ?? null,
        reportingName: t.reportingName ?? "",
        transactionType: t.transactionType ?? "",
        securitiesTransacted: t.securitiesTransacted ?? null,
        price: t.price ?? null,
        secLink: t.url ?? t.link ?? null,
      }));
      return live(NAME, trades);
    } catch (e) {
      if ((e as { status?: number })?.status === 402) return unavailable(NAME, "Insider data requires a paid FMP plan");
      return unavailable(NAME, e instanceof Error ? e.message : "insider trades fetch failed");
    }
  },

  async getDcf(symbol): Promise<DataResult<DcfValue>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/discounted-cash-flow?symbol=${symbol}&apikey=${KEY}`)) as any[];
      const d = Array.isArray(arr) ? arr[0] : null;
      if (!d) return unavailable(NAME, "No DCF data for " + symbol);
      const dcfVal = d.dcf ?? null;
      const price = d["Stock Price"] ?? d.price ?? null;
      const upDownPct =
        dcfVal != null && price != null && price > 0
          ? ((dcfVal - price) / price) * 100
          : null;
      return live(NAME, { symbol, dcf: dcfVal, price, upDownPct });
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "DCF fetch failed");
    }
  },

  // Daily close history for the Robinhood-style price chart. The "light"
  // endpoint (date + price + volume) is on the free tier and returns ~5yr.
  async getPriceHistory(symbol): Promise<DataResult<PriceHistory>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/historical-price-eod/light?symbol=${symbol}&apikey=${KEY}`)) as any[];
      if (!Array.isArray(arr) || arr.length === 0) return unavailable(NAME, "No price history for " + symbol);
      // FMP returns newest-first; reverse to oldest -> newest for left-to-right charts.
      const points = arr
        .map((p: { date: string; price?: number; close?: number }) => ({ date: p.date as string, close: Number(p.price ?? p.close) }))
        .filter((p) => p.date && Number.isFinite(p.close))
        .reverse();
      return live(NAME, { symbol, points });
    } catch (e) {
      if ((e as { status?: number })?.status === 402) return unavailable(NAME, "Price history requires a paid FMP plan");
      return unavailable(NAME, e instanceof Error ? e.message : "price history fetch failed");
    }
  },
};

// ── ETF Intelligence (E2) ─────────────────────────────────────────────────────
// FMP's ETF endpoints (etf/info, etf/holdings, etf/sector-weightings, etf/country-
// weightings) are commonly plan-tiered — a 4xx on lower plans. We use the same
// PROBE-AND-REMEMBER pattern as batch-quote: once an ETF endpoint 4xx's, remember
// it durably for 24h (server_cache, survives cold starts) and short-circuit to an
// honest plan-notice `unavailable()` without eating another 4xx. Each endpoint gets
// its own memo key so a partial plan (info yes, holdings no) degrades per-endpoint.
const ETF_DISABLED_TTL_MS = 24 * 60 * 60 * 1000;
const etfDisabledMem = new Map<string, number>(); // endpoint -> until epoch ms

async function etfDisabled(endpoint: string): Promise<boolean> {
  const memUntil = etfDisabledMem.get(endpoint) ?? 0;
  if (Date.now() < memUntil) return true;
  try {
    const { value } = await readServerCache<{ until: number }>(`fmp:etf-disabled:${endpoint}`, Number.MAX_SAFE_INTEGER);
    if (value && typeof value.until === "number" && Date.now() < value.until) {
      etfDisabledMem.set(endpoint, value.until);
      return true;
    }
  } catch { /* treat as not-disabled */ }
  return false;
}

async function disableEtf(endpoint: string, status: number): Promise<void> {
  const until = Date.now() + ETF_DISABLED_TTL_MS;
  etfDisabledMem.set(endpoint, until);
  health.lastError = `etf/${endpoint} HTTP ${status} — plan-tiered, remembered 24h`;
  health.lastErrorAt = new Date().toISOString();
  try { await writeServerCache(`fmp:etf-disabled:${endpoint}`, { until }); } catch { /* memory memo holds */ }
}

const PLAN_NOTE = "not available on current data plan";

// Shared runner: probe-and-remember around one ETF endpoint. `endpoint` is the memo
// key (e.g. "holdings"); `path` is the FMP stable path. Returns unavailable(PLAN_NOTE)
// on a remembered-disabled endpoint or a fresh 4xx, so the UI renders the plan-notice
// card. All calls are counted under the "etf" feature for the /connectors strip.
async function etfFetch<T>(endpoint: string, path: string, map: (raw: any) => T | null): Promise<DataResult<T>> {
  const KEY = getKey();
  if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
  if (await etfDisabled(endpoint)) return unavailable(NAME, PLAN_NOTE);
  return withFmpFeature("etf", async () => {
    try {
      const raw = await getJson(`${BASE}/${path}${path.includes("?") ? "&" : "?"}apikey=${KEY}`);
      const mapped = map(raw);
      if (mapped == null) return unavailable(NAME, "No ETF data");
      return live(NAME, mapped);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 429) {
        await disableEtf(endpoint, status);
        return unavailable(NAME, PLAN_NOTE);
      }
      return unavailable(NAME, e instanceof Error ? e.message : "ETF fetch failed");
    }
  });
}

export function getEtfInfo(symbol: string): Promise<DataResult<EtfInfo>> {
  return etfFetch<EtfInfo>("info", `etf/info?symbol=${symbol}`, (raw) => {
    const d = Array.isArray(raw) ? raw[0] : raw;
    if (!d) return null;
    return {
      symbol: d.symbol ?? symbol,
      name: d.name ?? null,
      expenseRatio: numOrNull(d.expenseRatio),
      aum: numOrNull(d.assetsUnderManagement ?? d.aum),
      inceptionDate: d.inceptionDate ?? null,
      domicile: d.domicile ?? null,
      etfCompany: d.etfCompany ?? d.issuer ?? null,
    };
  });
}

export function getEtfHoldings(symbol: string): Promise<DataResult<EtfHolding[]>> {
  return etfFetch<EtfHolding[]>("holdings", `etf/holdings?symbol=${symbol}`, (raw) => {
    if (!Array.isArray(raw)) return null;
    const rows: EtfHolding[] = raw.map((h: any) => {
      const assetType = String(h.assetType ?? h.securityType ?? "").toLowerCase();
      const name = h.name ?? h.asset ?? null;
      // Swaps/cash/collateral are NOT equities — flag them so the UI never lists a
      // swap contract as if it were a stock (swap-based leveraged funds like SOXL).
      const isEquity =
        !!h.asset &&
        !/swap|cash|collateral|repurchase|repo|deposit|money market|treasury bill/i.test(`${assetType} ${name ?? ""}`);
      return {
        symbol: isEquity ? (h.asset ?? null) : null,
        name,
        weight: numOrNull(h.weightPercentage ?? h.weight) ?? 0,
        isEquity,
      };
    });
    return rows.filter((r) => r.weight > 0 || r.name);
  });
}

export function getEtfSectorWeights(symbol: string): Promise<DataResult<EtfWeight[]>> {
  return etfFetch<EtfWeight[]>("sector-weightings", `etf/sector-weightings?symbol=${symbol}`, (raw) => {
    if (!Array.isArray(raw)) return null;
    return raw
      .map((s: any) => ({ label: s.sector ?? s.industry ?? "Other", weight: numOrNull(s.weightPercentage ?? s.weight) ?? 0 }))
      .filter((w: EtfWeight) => w.weight > 0);
  });
}

export function getEtfCountryWeights(symbol: string): Promise<DataResult<EtfWeight[]>> {
  return etfFetch<EtfWeight[]>("country-weightings", `etf/country-weightings?symbol=${symbol}`, (raw) => {
    if (!Array.isArray(raw)) return null;
    return raw
      .map((c: any) => ({ label: c.country ?? "Other", weight: numOrNull(c.weightPercentage ?? c.weight) ?? 0 }))
      .filter((w: EtfWeight) => w.weight > 0);
  });
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[%,$]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Stock screener ───────────────────────────────────────────────────────────
// Uses FMP's STABLE company-screener endpoint (verified against FMP docs). Maps
// our ScreenerFilters to FMP's *MoreThan/*LowerThan query params. Reuses the
// same cache + dedup + retry as every other call. Returns a DataResult so the UI
// gets the same live/unavailable honesty contract.
export async function screenStocks(filters: ScreenerFilters): Promise<DataResult<ScreenerRow[]>> {
  const KEY = getKey();
  if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");

  const params = new URLSearchParams();
  const setNum = (k: string, v: number | undefined) => { if (v != null && Number.isFinite(v)) params.set(k, String(v)); };
  setNum("marketCapMoreThan", filters.marketCapMoreThan);
  setNum("marketCapLowerThan", filters.marketCapLowerThan);
  setNum("priceMoreThan", filters.priceMoreThan);
  setNum("priceLowerThan", filters.priceLowerThan);
  setNum("betaMoreThan", filters.betaMoreThan);
  setNum("betaLowerThan", filters.betaLowerThan);
  setNum("volumeMoreThan", filters.volumeMoreThan);
  setNum("volumeLowerThan", filters.volumeLowerThan);
  setNum("dividendMoreThan", filters.dividendMoreThan);
  if (filters.sector) params.set("sector", filters.sector);
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.exchange) params.set("exchange", filters.exchange);
  if (filters.country) params.set("country", filters.country);
  if (filters.isEtf != null) params.set("isEtf", String(filters.isEtf));
  if (filters.isFund != null) params.set("isFund", String(filters.isFund));
  if (filters.isActivelyTrading != null) params.set("isActivelyTrading", String(filters.isActivelyTrading));
  params.set("limit", String(Math.min(Math.max(filters.limit ?? 100, 1), 500)));
  params.set("apikey", KEY);

  try {
    const arr = (await getJson(`${BASE}/company-screener?${params.toString()}`)) as any[];
    if (!Array.isArray(arr)) return unavailable(NAME, "Screener returned no data");
    const rows: ScreenerRow[] = arr.map((r) => ({
      symbol: String(r.symbol ?? ""),
      name: r.companyName ?? r.name ?? null,
      price: num(r.price),
      changePct: num(r.changePercentage ?? r.changesPercentage),
      marketCap: num(r.marketCap),
      volume: num(r.volume),
      beta: num(r.beta),
      sector: r.sector ?? null,
      industry: r.industry ?? null,
      exchange: r.exchangeShortName ?? r.exchange ?? null,
      country: r.country ?? null,
      dividend: num(r.lastAnnualDividend ?? r.dividend),
    })).filter((r) => r.symbol);
    return live(NAME, rows);
  } catch (e) {
    if ((e as { status?: number })?.status === 402) return unavailable(NAME, "Stock screener requires a paid FMP plan");
    if ((e as { status?: number })?.status === 429) return unavailable(NAME, "FMP rate/quota limit reached — try again shortly");
    return unavailable(NAME, e instanceof Error ? e.message : "screener fetch failed");
  }
}

// Small numeric coercion shared by the screener mapper.
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
