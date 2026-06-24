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
  live,
  unavailable,
} from "./types";
import { getConnectorValue } from "@/lib/connectors/runtime";

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

function getKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// ── Response cache ──────────────────────────────────────────────────────────
// FMP free tier = 250 calls/day. The app fires several calls per page, so we
// cache successful responses per-URL for a short TTL. This dramatically reduces
// calls (revisiting a stock, refreshing, multiple components on one page all
// hit the cache). Keyed by the URL WITHOUT the apikey so the key never lives in
// the cache keys. TTL is short enough that prices stay fresh-ish.
const CACHE_TTL_MS = 90_000; // 90s — quotes feel live, but repeat views are free
const cache = new Map<string, { at: number; data: unknown }>();

function cacheKey(url: string): string {
  return url.replace(/([?&])apikey=[^&]*/i, "$1apikey=__");
}

// Drop all cached FMP responses so the next call hits the API fresh. Used by the
// "Clear cache & refresh" action in Settings (e.g. when day-change drifts vs a
// broker before the 90s TTL expires).
export function clearFmpCache(): number {
  const n = cache.size;
  cache.clear();
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

// In-flight request map: collapses duplicate CONCURRENT calls for the same URL
// into a single HTTP request. The fresh cache only fills after a response
// returns, so without this two callers firing at the same instant (e.g. the
// Research page and the score route both wanting the same symbol's quote) each
// make their own network call. Keyed like the cache (apikey stripped).
const inflight = new Map<string, Promise<unknown>>();

// Fetch JSON with caching + in-flight dedup + retry-on-rate-limit. Throws with
// .status so callers can distinguish 402 (paid-only endpoint), 429 (limit), and
// other failures.
function getJson(url: string, attempt = 0): Promise<unknown> {
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data);

  // Only the first concurrent caller starts a request; the rest await it.
  // (attempt > 0 is an internal retry — it should not re-dedup.)
  if (attempt === 0) {
    const pending = inflight.get(key);
    if (pending) return pending;
  }

  const p = fetchJsonUncached(url, attempt).finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  if (attempt === 0) inflight.set(key, p);
  return p;
}

async function fetchJsonUncached(url: string, attempt: number): Promise<unknown> {
  const key = cacheKey(url);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  // Body literally says the quota is exhausted → real (daily/plan) limit.
  if (/limit reach/i.test(text)) throw new FmpLimitError();

  // Bare 429 = transient per-minute rate limit (common when a page fires many
  // calls at once). Retry up to 3x with backoff before giving up.
  if (res.status === 429) {
    if (attempt < 3) { await sleep(350 * (attempt + 1)); return getJson(url, attempt + 1); }
    throw new FmpLimitError();
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }

  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  cache.set(key, { at: Date.now(), data });
  return data;
}

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

export const fmpProvider: MarketDataProvider = {
  name: NAME,

  async getQuote(symbol): Promise<DataResult<Quote>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/quote?symbol=${symbol}&apikey=${KEY}`)) as any[];
      const q = Array.isArray(arr) ? arr[0] : null;
      if (!q) return unavailable(NAME, "No quote returned for " + symbol);
      const quote: Quote = {
        symbol: q.symbol,
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
      const asOf = q.timestamp ? new Date(q.timestamp * 1000).toISOString() : undefined;
      return live(NAME, quote, asOf);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "quote fetch failed");
    }
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
    } catch (e: any) {
      if (e?.status === 402) return unavailable(NAME, "News requires a paid FMP plan");
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
        ? arr.map((e: any) => e.date as string).filter((d) => d >= today).sort()
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
    } catch (e: any) {
      if (e?.status === 402) return unavailable(NAME, "Insider data requires a paid FMP plan");
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
        .map((p: any) => ({ date: p.date as string, close: Number(p.price ?? p.close) }))
        .filter((p) => p.date && Number.isFinite(p.close))
        .reverse();
      return live(NAME, { symbol, points });
    } catch (e: any) {
      if (e?.status === 402) return unavailable(NAME, "Price history requires a paid FMP plan");
      return unavailable(NAME, e instanceof Error ? e.message : "price history fetch failed");
    }
  },
};

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
  } catch (e: any) {
    if (e?.status === 402) return unavailable(NAME, "Stock screener requires a paid FMP plan");
    if (e?.status === 429) return unavailable(NAME, "FMP rate/quota limit reached — try again shortly");
    return unavailable(NAME, e instanceof Error ? e.message : "screener fetch failed");
  }
}

// Small numeric coercion shared by the screener mapper.
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
