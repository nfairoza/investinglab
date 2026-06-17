// The connectors shown on the Connectors page. Drives both the UI and the
// status checks.
// NOTE: the AI/Claude connector and the E*TRADE connector each have their own
// dedicated card (different auth flows), so they are NOT in this generic list.

export interface ConnectorField {
  id: string; // must match the env var name
  label: string;
  secret?: boolean;
  placeholder?: string;
}

export type ConnectorCategory = "ai" | "finance" | "other";

export interface Connector {
  id: string;
  label: string;
  purpose: string;
  category: ConnectorCategory;
  fields: ConnectorField[];
  envVars: string[]; // env var names that also satisfy this connector
  helpUrl?: string;
  // If set, the card shows a Test button that hits this URL and reports whether
  // it returned live data. Only meaningful for connectors with a wired route.
  testUrl?: string;
}

export const CONNECTORS: Connector[] = [
  // ── AI providers ─────────────────────────────────────────────────────────
  {
    id: "gemini",
    label: "Google Gemini — AI",
    purpose: "Powers chat, research memos, and predictions when Claude is unreachable. Also generates the app's artwork.",
    category: "ai",
    fields: [{ id: "GEMINI_API_KEY", label: "Gemini API key", secret: true, placeholder: "AI Studio key" }],
    envVars: ["GEMINI_API_KEY"],
    helpUrl: "https://aistudio.google.com/apikey",
  },
  // ── Finance data ─────────────────────────────────────────────────────────
  {
    id: "market_data",
    label: "Financial Modeling Prep — stock data",
    purpose: "Quotes, financials, profile, analyst targets, DCF, technicals. The research brain. Add this first.",
    category: "finance",
    fields: [{ id: "MARKET_DATA_API_KEY", label: "FMP API key", secret: true, placeholder: "your FMP key" }],
    envVars: ["MARKET_DATA_API_KEY", "FINANCIAL_DATA_API_KEY"],
    helpUrl: "https://site.financialmodelingprep.com/developer/docs",
    testUrl: "/api/quote?symbol=AAPL",
  },
  {
    id: "news",
    label: "News (FMP / news provider)",
    purpose: "Headlines and news-risk signals. Uses your FMP key, or a separate news key.",
    category: "finance",
    fields: [{ id: "NEWS_API_KEY", label: "News API key (optional)", secret: true }],
    envVars: ["NEWS_API_KEY"],
    testUrl: "/api/news?symbol=AAPL",
  },
  {
    id: "congress_trades",
    label: "Congress trades",
    purpose: "STOCK Act disclosures for the Congress tab.",
    category: "finance",
    fields: [
      { id: "CONGRESS_TRADES_API_KEY", label: "API key", secret: true },
      { id: "CONGRESS_TRADES_API_BASE", label: "Base URL" },
    ],
    envVars: ["CONGRESS_TRADES_API_KEY"],
    testUrl: "/api/congress?limit=1",
  },
  {
    id: "sec",
    label: "SEC EDGAR — filings",
    purpose: "Company filings (10-K/10-Q/8-K). Optional.",
    category: "other",
    fields: [{ id: "SEC_API_KEY", label: "SEC key (optional)", secret: true }],
    envVars: ["SEC_API_KEY"],
  },
];
