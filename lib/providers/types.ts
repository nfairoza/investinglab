// =============================================================================
// DATA-HONESTY CONTRACT  (read this first — it governs the whole app)
// =============================================================================
// Every external data point flows through DataResult<T>. The UI ALWAYS knows:
//   1. whether the data is LIVE, DEMO, or UNAVAILABLE  (-> the badge)
//   2. when the data is from                            (-> the timestamp)
//
// This makes the spec's non-negotiable rules STRUCTURAL, not optional:
//   - "Never present mock/demo data as if it were live"  -> source is set by the
//     adapter itself; demo data is literally tagged source: "demo".
//   - "Always display the data timestamp"                -> asOf travels with data.
//   - "If a call fails, show 'Live data unavailable'"    -> failures return
//     source: "unavailable" with data: null and a human-readable note.
//
// A component can never accidentally render demo numbers as live, because it has
// to read `source` to render anything.
// =============================================================================

export type DataSource = "live" | "demo" | "unavailable";

export interface DataResult<T> {
  data: T | null;
  source: DataSource;
  asOf: string | null; // ISO 8601 timestamp of the underlying data
  provider: string; // human-readable provider name, e.g. "Financial Modeling Prep"
  note?: string; // failure reason when unavailable, or a clarifying note for demo
}

// ----- Domain types --------------------------------------------------------

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number; // day change, $
  changePct: number; // day change, %
  marketCap: number | null;
  volume: number | null;
  week52High: number | null;
  week52Low: number | null;
  currency: string;
}

export interface QuarterFinancials {
  period: string; // e.g. "2025-Q3"
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  freeCashFlow: number | null;
}

export interface Financials {
  symbol: string;
  quarters: QuarterFinancials[]; // oldest -> newest, so charts read left to right
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
  summary?: string;
}

export interface EarningsDate {
  symbol: string;
  next: string | null; // ISO date of next earnings, if known
}

export interface SmaPoint {
  date: string;
  value: number;
}

export interface Technicals {
  symbol: string;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd?: number | null; // MACD line minus signal (>0 bullish momentum)
  volume?: number | null; // latest day volume
  avgVolume?: number | null; // ~50-day average volume (for unusual-volume detection)
  debtToEquity?: number | null; // total debt / equity (TTM)
  analystAction?: { action: string; firm: string; date: string } | null; // latest upgrade/downgrade
  sma50Series?: SmaPoint[]; // light history for overlaying moving averages
  sma200Series?: SmaPoint[];
}

// Daily close price point for the price-history (Robinhood-style) chart.
export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface PriceHistory {
  symbol: string;
  points: PricePoint[]; // oldest -> newest
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  description: string;
  sector: string | null;
  industry: string | null;
  ceo: string | null;
  employees: number | null;
  website: string | null;
  exchange: string | null;
  marketCap: number | null;
  beta: number | null;
  ipoDate: string | null;
  peers: string[]; // ticker symbols of peers
}

export interface AnalystData {
  symbol: string;
  priceTargetHigh: number | null;
  priceTargetLow: number | null;
  priceTargetConsensus: number | null;
  priceTargetAvg: number | null;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  // Most recent upgrade/downgrade
  latestGrade?: { date: string; firm: string; action: string; fromGrade: string; toGrade: string };
}

export interface InsiderTrade {
  symbol: string;
  date: string; // transaction date — when the insider actually traded
  filingDate: string | null; // when it was reported to the SEC (Form 4 filing)
  reportingName: string;
  transactionType: string; // "P-Purchase" | "S-Sale" | etc.
  securitiesTransacted: number | null;
  price: number | null;
  secLink: string | null;
}

export interface DcfValue {
  symbol: string;
  dcf: number | null; // intrinsic value per share
  price: number | null; // current price for easy comparison
  upDownPct: number | null; // how far above/below intrinsic value current price is
}

// ----- The interface every data provider implements ------------------------
// Add a new provider by writing one file that implements this, then point
// lib/providers/index.ts at it. Nothing else in the app changes.

export interface MarketDataProvider {
  name: string;
  getQuote(symbol: string): Promise<DataResult<Quote>>;
  getFinancials(symbol: string): Promise<DataResult<Financials>>;
  getNews(symbol: string): Promise<DataResult<NewsItem[]>>;
  getEarningsDate(symbol: string): Promise<DataResult<EarningsDate>>;
  getTechnicals(symbol: string): Promise<DataResult<Technicals>>;
  getCompanyProfile(symbol: string): Promise<DataResult<CompanyProfile>>;
  getAnalystData(symbol: string): Promise<DataResult<AnalystData>>;
  getInsiderTrades(symbol: string): Promise<DataResult<InsiderTrade[]>>;
  getDcf(symbol: string): Promise<DataResult<DcfValue>>;
  getPriceHistory(symbol: string): Promise<DataResult<PriceHistory>>;
}

// ----- Congressional trades (STOCK Act disclosures) ------------------------
// Public data: U.S. members of Congress must disclose securities transactions
// within 45 days of the trade. Two honesty caveats are baked into the type so
// the UI literally cannot forget them:
//   - it is LAGGED DISCLOSURE, not a live position  (disclosureDate vs txDate)
//   - amounts are RANGES, never exact figures        (amountRange)

export type CongressChamber = "House" | "Senate";
export type TradeType = "buy" | "sell" | "exchange";

export interface CongressTrade {
  id: string;
  member: string; // disclosing member's name (from the official filing)
  chamber: CongressChamber;
  party?: string; // "D" | "R" | "I" — sources vary, so optional
  state?: string; // e.g. "CA"
  symbol: string | null; // ticker, when the asset maps to one
  asset: string; // asset description exactly as disclosed
  type: TradeType;
  amountRange: string; // disclosed RANGE, e.g. "$1,001–$15,000" — never exact
  txDate: string; // ISO date the trade was made
  disclosureDate: string; // ISO date it was reported (txDate + up to 45 days)
  sourceLink: string | null; // link to the official filing (Senate eFD / House Clerk PTR)
}

// Same swappable-adapter pattern as MarketDataProvider. Implement this once
// against a real source and point lib/providers/index.ts at it.
export interface CongressTradesProvider {
  name: string;
  getRecent(limit?: number): Promise<DataResult<CongressTrade[]>>;
  getByMember(member: string): Promise<DataResult<CongressTrade[]>>;
  getByTicker(symbol: string): Promise<DataResult<CongressTrade[]>>;
}

// ----- Helpers so adapters stay terse and consistent -----------------------

export function live<T>(provider: string, data: T, asOf?: string): DataResult<T> {
  return { data, source: "live", asOf: asOf ?? new Date().toISOString(), provider };
}

export function demo<T>(provider: string, data: T): DataResult<T> {
  return {
    data,
    source: "demo",
    asOf: new Date().toISOString(),
    provider,
    note: "Demo data — not live.",
  };
}

export function unavailable<T>(provider: string, note: string): DataResult<T> {
  return { data: null, source: "unavailable", asOf: null, provider, note };
}
