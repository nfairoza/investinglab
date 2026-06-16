// The connectors shown on the Connectors page. Drives both the UI and the
// status checks. Phases follow the rollout plan: 1 = research brain (now),
// 2 = live market + trading, 3 = paper trading (uses the Alpaca connector).
// NOTE: the AI/Claude connector is managed by its own control (model + test),
// so it is rendered separately and is not in this list.

export interface ConnectorField {
  id: string; // must match the env var name
  label: string;
  secret?: boolean;
  placeholder?: string;
}

export interface Connector {
  id: string;
  label: string;
  purpose: string;
  phase: 1 | 2 | 3;
  fields: ConnectorField[];
  envVars: string[]; // env var names that also satisfy this connector
  helpUrl?: string;
  testable?: boolean; // show a Test button (market data only, for now)
}

export const CONNECTORS: Connector[] = [
  {
    id: "market_data",
    label: "Financial Modeling Prep — stock data",
    purpose: "Quotes, financials, technicals. The research brain. Add this first.",
    phase: 1,
    fields: [{ id: "MARKET_DATA_API_KEY", label: "FMP API key", secret: true, placeholder: "your FMP key" }],
    envVars: ["MARKET_DATA_API_KEY", "FINANCIAL_DATA_API_KEY"],
    helpUrl: "https://site.financialmodelingprep.com/developer/docs",
    testable: true,
  },
  {
    id: "sec",
    label: "SEC EDGAR — filings",
    purpose: "Company filings (10-K/10-Q/8-K).",
    phase: 1,
    fields: [{ id: "SEC_API_KEY", label: "SEC key (optional)", secret: true }],
    envVars: ["SEC_API_KEY"],
  },
  {
    id: "news",
    label: "News provider",
    purpose: "Headlines and news-risk signals.",
    phase: 1,
    fields: [{ id: "NEWS_API_KEY", label: "News API key", secret: true }],
    envVars: ["NEWS_API_KEY"],
  },
  {
    id: "congress_trades",
    label: "Congress trades",
    purpose: "STOCK Act disclosures for the Congress tab.",
    phase: 1,
    fields: [
      { id: "CONGRESS_TRADES_API_KEY", label: "API key", secret: true },
      { id: "CONGRESS_TRADES_API_BASE", label: "Base URL" },
    ],
    envVars: ["CONGRESS_TRADES_API_KEY"],
  },
  {
    id: "etrade",
    label: "E*TRADE — portfolio sync",
    purpose: "Read-only: pulls your real brokerage positions. OAuth-based — no password ever leaves E*TRADE.",
    phase: 1,
    fields: [
      { id: "ETRADE_CONSUMER_KEY", label: "Consumer key", secret: true },
      { id: "ETRADE_CONSUMER_SECRET", label: "Consumer secret", secret: true },
    ],
    envVars: ["ETRADE_CONSUMER_KEY", "ETRADE_CONSUMER_SECRET"],
    helpUrl: "https://developer.etrade.com",
  },
  {
    id: "alpaca",
    label: "Alpaca — live market + trading",
    purpose: "Live data + (paper/live) trading engine. Phase 2 ($99/mo Algo Trader Plus).",
    phase: 2,
    fields: [
      { id: "ALPACA_KEY_ID", label: "Key ID", secret: true },
      { id: "ALPACA_SECRET", label: "Secret key", secret: true },
    ],
    envVars: ["ALPACA_KEY_ID", "ALPACA_SECRET"],
    helpUrl: "https://alpaca.markets",
  },
  {
    id: "prediction_market",
    label: "Prediction markets (Polymarket / Kalshi)",
    purpose: "Market-implied odds for the Predictions tab.",
    phase: 2,
    fields: [{ id: "PREDICTION_MARKET_API_KEY", label: "API key", secret: true }],
    envVars: ["PREDICTION_MARKET_API_KEY"],
  },
];
