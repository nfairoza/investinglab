// Sample data for demo mode. A visitor exploring /demo sees a realistic, funded
// account: real tickers (so live FMP pricing runs against them), a couple of
// manual assets/liabilities, a cash balance, watchlists, and a month of
// categorized transactions. NONE of this touches the real database — it's served
// by the fake Supabase client in lib/demo/client.ts. Writes are no-ops.
//
// Deterministic on purpose (no Date.now/random): stable across the demo session.

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "demo@rukmoney.com",
  fullName: "Demo Investor",
} as const;

// Stable ISO timestamps so nothing depends on the clock.
const T0 = "2026-01-02T14:30:00.000Z";

// ── holdings ──────────────────────────────────────────────────────────────────
// Real tickers with cost basis; live-priced at request time by the real code
// paths (market_value left null so the app fills it from the live quote).
export const DEMO_HOLDINGS = [
  { id: "h1", user_id: DEMO_USER.id, symbol: "AAPL", shares: 40, avg_cost: 165.2, note: null, source: "manual", asset_type: "stock", market_value: null, days_gain: null, days_gain_pct: null, total_gain: null, total_gain_pct: null, created_at: T0, updated_at: T0 },
  { id: "h2", user_id: DEMO_USER.id, symbol: "MSFT", shares: 18, avg_cost: 310.5, note: null, source: "manual", asset_type: "stock", market_value: null, days_gain: null, days_gain_pct: null, total_gain: null, total_gain_pct: null, created_at: T0, updated_at: T0 },
  { id: "h3", user_id: DEMO_USER.id, symbol: "NVDA", shares: 60, avg_cost: 72.4, note: null, source: "manual", asset_type: "stock", market_value: null, days_gain: null, days_gain_pct: null, total_gain: null, total_gain_pct: null, created_at: T0, updated_at: T0 },
  { id: "h4", user_id: DEMO_USER.id, symbol: "AMD", shares: 50, avg_cost: 118.9, note: null, source: "manual", asset_type: "stock", market_value: null, days_gain: null, days_gain_pct: null, total_gain: null, total_gain_pct: null, created_at: T0, updated_at: T0 },
  { id: "h5", user_id: DEMO_USER.id, symbol: "VOO", shares: 25, avg_cost: 402.1, note: null, source: "manual", asset_type: "etf", market_value: null, days_gain: null, days_gain_pct: null, total_gain: null, total_gain_pct: null, created_at: T0, updated_at: T0 },
];

// ── cash ────────────────────────────────────────────────────────────────────
export const DEMO_CASH = { id: "c1", user_id: DEMO_USER.id, amount: 18450, source: "manual", updated_at: T0 };

// ── manual_items (house, car, mortgage) ──────────────────────────────────────
export const DEMO_MANUAL_ITEMS = [
  { id: "m1", user_id: DEMO_USER.id, name: "Primary residence", kind: "asset", type: "real_estate", value: 540000, created_at: T0, updated_at: T0 },
  { id: "m2", user_id: DEMO_USER.id, name: "2022 Tesla Model 3", kind: "asset", type: "vehicle", value: 28000, created_at: T0, updated_at: T0 },
  { id: "m3", user_id: DEMO_USER.id, name: "Home mortgage", kind: "liability", type: "mortgage", value: 358000, created_at: T0, updated_at: T0 },
  { id: "m4", user_id: DEMO_USER.id, name: "Auto loan", kind: "liability", type: "loan", value: 14200, created_at: T0, updated_at: T0 },
];

// ── watch_lists + items ──────────────────────────────────────────────────────
export const DEMO_WATCH_LISTS = [
  { id: "wl_default", user_id: DEMO_USER.id, name: "My Watchlist", kind: "default", preset_key: null, sort_order: 0, created_at: T0, updated_at: T0 },
  { id: "wl_ai", user_id: DEMO_USER.id, name: "AI & Semiconductors", kind: "custom", preset_key: null, sort_order: 1, created_at: T0, updated_at: T0 },
];
export const DEMO_WATCH_LIST_ITEMS = [
  { id: "wi1", user_id: DEMO_USER.id, list_id: "wl_default", symbol: "TSLA", created_at: T0 },
  { id: "wi2", user_id: DEMO_USER.id, list_id: "wl_default", symbol: "AMZN", created_at: T0 },
  { id: "wi3", user_id: DEMO_USER.id, list_id: "wl_default", symbol: "GOOGL", created_at: T0 },
  { id: "wi4", user_id: DEMO_USER.id, list_id: "wl_ai", symbol: "NVDA", created_at: T0 },
  { id: "wi5", user_id: DEMO_USER.id, list_id: "wl_ai", symbol: "AVGO", created_at: T0 },
  { id: "wi6", user_id: DEMO_USER.id, list_id: "wl_ai", symbol: "AMD", created_at: T0 },
  { id: "wi7", user_id: DEMO_USER.id, list_id: "wl_ai", symbol: "TSM", created_at: T0 },
];

// Legacy single-table watchlist (some routes still read `watchlist`).
export const DEMO_WATCHLIST = DEMO_WATCH_LIST_ITEMS.map((w) => ({ id: w.id, user_id: DEMO_USER.id, symbol: w.symbol, created_at: w.created_at }));

// ── user_prefs ────────────────────────────────────────────────────────────────
export const DEMO_USER_PREFS = {
  user_id: DEMO_USER.id,
  prefs: { displayName: DEMO_USER.fullName, baseCurrency: "USD", beginnerMode: true },
  ai_cache: {},
  updated_at: T0,
};

// ── plaid_transactions (a month of categorized spend; negative = debit) ────────
// Dates are relative-free fixed strings; amounts follow Plaid's sign convention
// (positive = money out / debit, negative = money in / credit) matching how the
// app's categorizer + money insights read them.
export const DEMO_TRANSACTIONS = (() => {
  const rows: Array<Record<string, unknown>> = [];
  const push = (date: string, amount: number, merchant: string, name: string, cat: string, det: string) =>
    rows.push({ user_id: DEMO_USER.id, date, amount, merchant, name, plaid_category: cat, plaid_detailed: det, account_id: "demo_checking", removed: false });
  push("2026-01-01", -5200, "Employer Payroll", "ACME CORP DIRECT DEP", "INCOME", "INCOME_WAGES");
  push("2026-01-02", 1820, "Wells Fargo", "MORTGAGE PMT", "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT");
  push("2026-01-03", 92.4, "Whole Foods", "WHOLEFDS MKT", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
  push("2026-01-05", 14.99, "Netflix", "NETFLIX.COM", "ENTERTAINMENT", "ENTERTAINMENT_STREAMING");
  push("2026-01-06", 46.8, "Shell", "SHELL OIL", "TRANSPORTATION", "TRANSPORTATION_GAS");
  push("2026-01-08", 128.5, "Costco", "COSTCO WHSE", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
  push("2026-01-10", 63.2, "Uber", "UBER TRIP", "TRANSPORTATION", "TRANSPORTATION_RIDE_SHARE");
  push("2026-01-12", 210, "PG&E", "PGANDE WEB", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY");
  push("2026-01-14", 34.7, "Chipotle", "CHIPOTLE 2244", "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT");
  push("2026-01-15", 9.99, "Spotify", "SPOTIFY USA", "ENTERTAINMENT", "ENTERTAINMENT_STREAMING");
  push("2026-01-16", 156.2, "Amazon", "AMZN MKTP US", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES");
  push("2026-01-18", 420, "United Airlines", "UNITED 016", "TRAVEL", "TRAVEL_FLIGHTS");
  push("2026-01-20", 78.3, "Trader Joe's", "TRADER JOES", "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES");
  push("2026-01-22", 55, "AT&T", "ATT PMT", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE");
  push("2026-01-24", 38.9, "Starbucks", "STARBUCKS 119", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE");
  push("2026-01-26", 240, "Delta Dental", "DELTA DENTAL PREM", "MEDICAL", "MEDICAL_DENTAL_CARE");
  push("2026-01-28", 112.6, "Target", "TARGET 00023", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES");
  push("2026-01-30", 22.5, "Apple", "APPLE.COM/BILL", "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS");
  return rows.map((r, i) => ({ id: `tx${i + 1}`, ...r }));
})();

// Central registry the fake client consults, keyed by table name. A table not
// listed here returns an empty set (safe default — the feature just shows empty).
export const DEMO_TABLES: Record<string, any[]> = {
  holdings: DEMO_HOLDINGS,
  cash: [DEMO_CASH],
  manual_items: DEMO_MANUAL_ITEMS,
  watch_lists: DEMO_WATCH_LISTS,
  watch_list_items: DEMO_WATCH_LIST_ITEMS,
  watchlist: DEMO_WATCHLIST,
  user_prefs: [DEMO_USER_PREFS],
  plaid_transactions: DEMO_TRANSACTIONS,
  plaid_items: [], // no linked banks in demo → net worth uses manual + holdings
  shared_predictions: [],
  server_cache: [],
};
