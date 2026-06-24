// =============================================================================
// Shared domain types + tiny id/time helpers.
//
// Persistence used to be a lowdb JSON file here; everything is now per-user in
// Supabase (holdings, watchlist, journal, alerts, cash, AI cache via
// supabase-data; broker OAuth tokens via broker-store). This module is kept only
// for the shared TypeScript interfaces these routes/components import, plus the
// two pure helpers. No filesystem, no lowdb.
// =============================================================================

// ---- Types ------------------------------------------------------------------

export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  note?: string;
  source?: string; // "manual" | "etrade" | "robinhood"
  assetType?: "stock" | "crypto"; // defaults to stock when absent
  // Broker-provided gain metrics (E*TRADE). Optional — only set on synced rows.
  // Snapshotted at sync time; the live price still updates value via FMP.
  daysGain?: number;       // $ change today
  daysGainPct?: number;    // % change today
  totalGain?: number;      // $ gain since purchase
  totalGainPct?: number;   // % gain since purchase
  marketValue?: number;    // broker's market value at sync
  createdAt: string;
  updatedAt: string;
}

export interface WatchItem {
  id: string;
  symbol: string;
  idealBuy?: number;
  note?: string;
  // AI-generated analysis (via /api/watchlist/enrich). Optional.
  fairValue?: string;     // e.g. "$180–$210"
  bullCase?: string;
  bearCase?: string;
  catalyst?: string;      // next catalyst / why-now
  aiAction?: string;      // Buy now / Start small / Wait / Avoid
  analyzedAt?: string;    // ISO when AI last enriched
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  symbol: string;
  type: "price" | "dayMove" | "earnings" | "score";
  direction?: "above" | "below";   // price target
  price?: number;                  // price target $
  movePct?: number;                // dayMove threshold (abs %)
  withinDays?: number;             // earnings horizon (days)
  scoreOp?: "below" | "above";     // score crossing
  scoreValue?: number;             // score threshold 0..100
  note?: string;
  enabled: boolean;
  lastTriggeredAt?: string;        // ISO; de-dupe + feed
  lastValue?: number;              // the value that tripped it
  triggerCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entryReason: string;
  targetPrice?: number;
  stopLoss?: number;
  exitCriteria?: string;
  status: "open" | "closed";
  result1w?: string;
  result1m?: string;
  createdAt: string;
  updatedAt: string;
}

// Available cash to deploy. `source` records where the number came from so the
// UI can show "from E*TRADE" vs a manual entry.
export interface CashState {
  amount: number;
  source: "manual" | "etrade";
  updatedAt: string | null;
}

// Cached AI output (opportunities scan, suggested alerts). Stored so an
// auto-run-on-open feature can reuse a recent result instead of re-spending
// tokens on every visit. `data` is the route-specific payload.
export interface AiCacheEntry {
  generatedAt: string;
  data: unknown;
}

// ---- Helpers ----------------------------------------------------------------

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function now(): string {
  return new Date().toISOString();
}
