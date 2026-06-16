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
// Financial Modeling Prep adapter.
// The key is read at CALL TIME (not module load) so a key added in the
// Connectors UI takes effect immediately. Field mappings are FMP-specific; if
// you swap providers you only touch this file.
// =============================================================================

const NAME = "Financial Modeling Prep";
const BASE = "https://financialmodelingprep.com/api/v3";
const BASE4 = "https://financialmodelingprep.com/api/v4";

function getKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const fmpProvider: MarketDataProvider = {
  name: NAME,

  async getQuote(symbol): Promise<DataResult<Quote>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/quote/${symbol}?apikey=${KEY}`)) as any[];
      const q = Array.isArray(arr) ? arr[0] : null;
      if (!q) return unavailable(NAME, "No quote returned for " + symbol);
      const quote: Quote = {
        symbol: q.symbol,
        name: q.name ?? symbol,
        price: q.price,
        change: q.change ?? 0,
        changePct: q.changesPercentage ?? 0,
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
        getJson(`${BASE}/income-statement/${symbol}?period=quarter&limit=8&apikey=${KEY}`),
        getJson(`${BASE}/cash-flow-statement/${symbol}?period=quarter&limit=8&apikey=${KEY}`),
      ]);
      const inc = income as any[];
      if (!Array.isArray(inc) || inc.length === 0) return unavailable(NAME, "No financials");
      const fcfByDate = new Map<string, number>();
      if (Array.isArray(cash)) for (const c of cash as any[]) fcfByDate.set(c.date, c.freeCashFlow);
      const quarters = inc
        .slice()
        .reverse()
        .map((r: any) => ({
          period: r.period && r.calendarYear ? `${r.calendarYear}-${r.period}` : r.date,
          revenue: r.revenue ?? null,
          netIncome: r.netIncome ?? null,
          eps: r.epsdiluted ?? r.eps ?? null,
          grossMarginPct: r.revenue ? (r.grossProfit / r.revenue) * 100 : null,
          operatingMarginPct: r.revenue ? (r.operatingIncome / r.revenue) * 100 : null,
          freeCashFlow: fcfByDate.get(r.date) ?? null,
        }));
      return live(NAME, { symbol, quarters });
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "financials fetch failed");
    }
  },

  async getNews(symbol): Promise<DataResult<NewsItem[]>> {
    const newsKey = getConnectorValue("NEWS_API_KEY") || getKey();
    if (!newsKey) return unavailable(NAME, "NEWS_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/stock_news?tickers=${symbol}&limit=20&apikey=${newsKey}`)) as any[];
      if (!Array.isArray(arr)) return unavailable(NAME, "No news");
      const items: NewsItem[] = arr.map((n: any) => ({
        title: n.title,
        url: n.url,
        source: n.site,
        publishedAt: n.publishedDate,
        summary: n.text,
      }));
      return live(NAME, items);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "news fetch failed");
    }
  },

  async getEarningsDate(symbol): Promise<DataResult<EarningsDate>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/historical/earning_calendar/${symbol}?apikey=${KEY}`)) as any[];
      const today = new Date().toISOString().slice(0, 10);
      const future = Array.isArray(arr)
        ? arr.map((e: any) => e.date as string).filter((d) => d >= today).sort()
        : [];
      return live(NAME, { symbol, next: future[0] ?? null });
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "earnings fetch failed");
    }
  },

  async getTechnicals(symbol): Promise<DataResult<Technicals>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const [sma50, sma200, rsi] = await Promise.all([
        getJson(`${BASE}/technical_indicator/1day/${symbol}?type=sma&period=50&apikey=${KEY}`),
        getJson(`${BASE}/technical_indicator/1day/${symbol}?type=sma&period=200&apikey=${KEY}`),
        getJson(`${BASE}/technical_indicator/1day/${symbol}?type=rsi&period=14&apikey=${KEY}`),
      ]);
      const head = (a: unknown) => (Array.isArray(a) && a[0] ? a[0] : null);
      const toSeries = (a: unknown, key: string) =>
        Array.isArray(a)
          ? (a as any[]).slice(0, 250).reverse().map((p) => ({ date: p.date, value: p[key] }))
          : [];
      const t: Technicals = {
        symbol,
        sma50: head(sma50)?.sma ?? null,
        sma200: head(sma200)?.sma ?? null,
        rsi14: head(rsi)?.rsi ?? null,
        sma50Series: toSeries(sma50, "sma"),
        sma200Series: toSeries(sma200, "sma"),
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
        getJson(`${BASE}/profile/${symbol}?apikey=${KEY}`),
        getJson(`${BASE4}/stock_peers?symbol=${symbol}&apikey=${KEY}`).catch(() => []),
      ]);
      const p = Array.isArray(profileArr) ? profileArr[0] : null;
      if (!p) return unavailable(NAME, "No profile for " + symbol);
      const peers: string[] = Array.isArray(peersArr) && peersArr[0]?.peersList
        ? peersArr[0].peersList
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
        exchange: p.exchangeShortName ?? null,
        marketCap: p.mktCap ?? null,
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
      const [targetSummary, gradesSummary, gradesArr] = await Promise.all([
        getJson(`${BASE4}/price-target-summary?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
        getJson(`${BASE4}/grades-consensus?symbol=${symbol}&apikey=${KEY}`).catch(() => null),
        getJson(`${BASE4}/grades?symbol=${symbol}&limit=5&apikey=${KEY}`).catch(() => []),
      ]);

      const ts = Array.isArray(targetSummary) ? targetSummary[0] : (targetSummary as any);
      const gs = Array.isArray(gradesSummary) ? gradesSummary[0] : (gradesSummary as any);
      const grades = Array.isArray(gradesArr) ? gradesArr : [];
      const latest = grades[0] as any | undefined;

      const analyst: AnalystData = {
        symbol,
        priceTargetHigh: ts?.targetHigh ?? null,
        priceTargetLow: ts?.targetLow ?? null,
        priceTargetConsensus: ts?.targetConsensus ?? null,
        priceTargetAvg: ts?.targetMean ?? null,
        strongBuy: gs?.strongBuy ?? 0,
        buy: gs?.buy ?? 0,
        hold: gs?.hold ?? 0,
        sell: gs?.sell ?? 0,
        strongSell: gs?.strongSell ?? 0,
        latestGrade: latest
          ? {
              date: latest.date,
              firm: latest.gradingCompany,
              action: latest.action,
              fromGrade: latest.previousGrade ?? "",
              toGrade: latest.newGrade ?? "",
            }
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
      const arr = (await getJson(`${BASE4}/insider-trading?symbol=${symbol}&limit=20&apikey=${KEY}`)) as any[];
      if (!Array.isArray(arr)) return unavailable(NAME, "No insider trades");
      const trades: InsiderTrade[] = arr.map((t: any) => ({
        symbol,
        date: t.transactionDate ?? t.filingDate ?? "",
        reportingName: t.reportingName ?? "",
        transactionType: t.transactionType ?? "",
        securitiesTransacted: t.securitiesTransacted ?? null,
        price: t.price ?? null,
        secLink: t.link ?? null,
      }));
      return live(NAME, trades);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "insider trades fetch failed");
    }
  },

  async getDcf(symbol): Promise<DataResult<DcfValue>> {
    const KEY = getKey();
    if (!KEY) return unavailable(NAME, "MARKET_DATA_API_KEY missing");
    try {
      const arr = (await getJson(`${BASE}/discounted-cash-flow/${symbol}?apikey=${KEY}`)) as any[];
      const d = Array.isArray(arr) ? arr[0] : null;
      if (!d) return unavailable(NAME, "No DCF data for " + symbol);
      const dcfVal = d.dcf ?? null;
      const price = d.Stock_Price ?? d.price ?? null;
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
