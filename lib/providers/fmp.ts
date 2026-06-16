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

// Fetch JSON; throws with the HTTP status (and 402 flagged) so callers can
// distinguish "paid endpoint" from a real failure.
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
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

  // The stable technical-indicator endpoints are paid. The free quote endpoint,
  // however, returns priceAvg50 / priceAvg200, so we surface those as the moving
  // averages (the scoring engine's trend factor uses exactly these). RSI and the
  // historical series need a paid plan, so they stay null.
  async getTechnicals(symbol): Promise<DataResult<Technicals>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/quote?symbol=${symbol}&apikey=${KEY}`)) as any[];
      const q = Array.isArray(arr) ? arr[0] : null;
      if (!q) return unavailable(NAME, "No technicals for " + symbol);
      const t: Technicals = {
        symbol,
        sma50: q.priceAvg50 ?? null,
        sma200: q.priceAvg200 ?? null,
        rsi14: null, // paid endpoint
        sma50Series: [],
        sma200Series: [],
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
      const [targetSummary, gradesConsensus] = await Promise.all([
        getJson(`${BASE}/price-target-summary?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
        getJson(`${BASE}/grades-consensus?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
      ]);

      const ts = Array.isArray(targetSummary) ? targetSummary[0] : (targetSummary as any);
      const gs = Array.isArray(gradesConsensus) ? gradesConsensus[0] : (gradesConsensus as any);

      // stable price-target-summary gives count + avg per window, not high/low.
      // Use the last-quarter average as the consensus.
      const consensus = ts?.lastQuarterAvgPriceTarget ?? ts?.lastYearAvgPriceTarget ?? null;

      const analyst: AnalystData = {
        symbol,
        priceTargetHigh: null,
        priceTargetLow: null,
        priceTargetConsensus: consensus,
        priceTargetAvg: ts?.lastYearAvgPriceTarget ?? null,
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
      const arr = (await getJson(`${BASE}/insider-trading/search?symbol=${symbol}&page=0&limit=20&apikey=${KEY}`)) as any[];
      if (!Array.isArray(arr)) return unavailable(NAME, "No insider trades");
      const trades: InsiderTrade[] = arr.map((t: any) => ({
        symbol,
        date: t.transactionDate ?? t.filingDate ?? "",
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
};
