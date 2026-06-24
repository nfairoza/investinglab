import { MarketDataProvider, CongressTradesProvider, DataResult, ScreenerRow, ScreenerFilters, unavailable } from "./types";
import { fmpProvider, screenStocks as fmpScreenStocks } from "./fmp";
import { demoProvider } from "./demo";
import { congressApiProvider } from "./congress-api";
import { congressDemoProvider } from "./congress-demo";
import { getConnectorValue } from "@/lib/connectors/runtime";

// =============================================================================
// Provider selection happens PER CALL (not at import) so keys added in the
// Connectors UI switch demo->live immediately. To add a market-data provider,
// write lib/providers/<name>.ts implementing MarketDataProvider and swap it in
// for fmpProvider below.
// =============================================================================

function hasMarketKey(): boolean {
  return Boolean(getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY"));
}
function market(): MarketDataProvider {
  return hasMarketKey() ? fmpProvider : demoProvider;
}

export const marketData: MarketDataProvider = {
  name: "auto",
  getQuote: (s) => market().getQuote(s),
  getFinancials: (s) => market().getFinancials(s),
  getNews: (s) => market().getNews(s),
  getEarningsDate: (s) => market().getEarningsDate(s),
  getTechnicals: (s) => market().getTechnicals(s),
  getCompanyProfile: (s) => market().getCompanyProfile(s),
  getAnalystData: (s) => market().getAnalystData(s),
  getInsiderTrades: (s) => market().getInsiderTrades(s),
  getDcf: (s) => market().getDcf(s),
  getPriceHistory: (s) => market().getPriceHistory(s),
};

// Congressional trades come from FMP (Senate/House disclosure endpoints, included
// in the Starter plan), so they reuse the market-data key — no separate key.
function hasCongressKey(): boolean {
  return Boolean(getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY"));
}
function congress(): CongressTradesProvider {
  return hasCongressKey() ? congressApiProvider : congressDemoProvider;
}

// Screener needs a real market key (the demo provider has no universe to scan).
// Without a key we return an honest "unavailable" rather than fake rows.
export function screenStocks(filters: ScreenerFilters): Promise<DataResult<ScreenerRow[]>> {
  if (!hasMarketKey()) return Promise.resolve(unavailable("auto", "MARKET_DATA_API_KEY missing — add a market-data key in Connectors to use the screener"));
  return fmpScreenStocks(filters);
}

export const congressData: CongressTradesProvider = {
  name: "auto",
  getRecent: (limit) => congress().getRecent(limit),
  getByMember: (m) => congress().getByMember(m),
  getByTicker: (t) => congress().getByTicker(t),
};

export * from "./types";
