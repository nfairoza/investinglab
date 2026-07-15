// =============================================================================
// AIOPT A7 — per-feature daily token budgets + degradation ladder.
//
// Spend can never run away: each AI feature has a generous daily token ceiling.
// At 80% an admin is notified; at 100% the feature DEGRADES (serve stale, drop
// to templates, economy models) instead of overspending — nothing hard-fails.
//
// This module is pure math over a "spent so far today" number the caller loads
// from ai_usage. The DB read + the notification live in the callers/cron.
// =============================================================================

export type DegradeStep =
  | "none"          // under budget — full behavior
  | "template"      // narration → number-only templates (no LLM)
  | "serve-stale"   // enrichment → serve the cached value with an age chip
  | "skip"          // optional AI block (digest) → omit it
  | "economy";      // chat → cheapest models + tighter rate limit (never fully off)

export interface FeatureBudget {
  feature: string;
  dailyTokens: number;  // generous ceiling
  onExhausted: DegradeStep;
}

// Generous daily ceilings (input+output tokens) per feature. Sized so normal
// usage never trips them; they exist to catch a runaway loop or abuse, not to
// ration. Tune from the admin cost dashboard once real usage is known.
export const FEATURE_BUDGETS: FeatureBudget[] = [
  { feature: "chat", dailyTokens: 5_000_000, onExhausted: "economy" },
  { feature: "research", dailyTokens: 3_000_000, onExhausted: "serve-stale" },
  { feature: "doctor", dailyTokens: 2_000_000, onExhausted: "serve-stale" },
  { feature: "money-analysis", dailyTokens: 2_000_000, onExhausted: "serve-stale" },
  { feature: "opportunities", dailyTokens: 1_500_000, onExhausted: "serve-stale" },
  { feature: "congress-alpha", dailyTokens: 1_500_000, onExhausted: "serve-stale" },
  { feature: "insights-narration", dailyTokens: 2_000_000, onExhausted: "template" },
  { feature: "enrich", dailyTokens: 2_000_000, onExhausted: "serve-stale" },
  { feature: "watchlist-recs", dailyTokens: 500_000, onExhausted: "serve-stale" },
  { feature: "alerts-suggest", dailyTokens: 500_000, onExhausted: "skip" },
  { feature: "screener-ranking", dailyTokens: 1_000_000, onExhausted: "serve-stale" },
  { feature: "market-brief", dailyTokens: 500_000, onExhausted: "skip" },
  { feature: "predict", dailyTokens: 1_500_000, onExhausted: "serve-stale" },
];

const WARN_FRACTION = 0.8;

export function budgetFor(feature: string): FeatureBudget | null {
  return FEATURE_BUDGETS.find((b) => b.feature === feature) ?? null;
}

export interface BudgetState {
  feature: string;
  dailyTokens: number;
  spent: number;
  fraction: number;      // spent / dailyTokens
  warn: boolean;         // >= 80% (notify admin once)
  exhausted: boolean;    // >= 100% (degrade)
  degrade: DegradeStep;  // "none" until exhausted, then the feature's step
}

// Evaluate a feature's budget given today's spent tokens. Unknown features have
// no budget → always "none" (uncapped but visible in the cost dashboard).
export function evaluateBudget(feature: string, spentToday: number): BudgetState {
  const b = budgetFor(feature);
  if (!b) return { feature, dailyTokens: Infinity, spent: spentToday, fraction: 0, warn: false, exhausted: false, degrade: "none" };
  const fraction = b.dailyTokens > 0 ? spentToday / b.dailyTokens : 0;
  const exhausted = fraction >= 1;
  return {
    feature,
    dailyTokens: b.dailyTokens,
    spent: spentToday,
    fraction: Math.round(fraction * 1000) / 1000,
    warn: fraction >= WARN_FRACTION,
    exhausted,
    degrade: exhausted ? b.onExhausted : "none",
  };
}

// AIOPT A7 anomaly guard: a single non-admin user exceeding 3× the fleet p95
// daily tokens gets clamped to economy routing for 24h. Pure predicate; the
// caller supplies the user's spend + the fleet p95.
export function isAnomalousUser(userSpentToday: number, fleetP95: number, multiple = 3): boolean {
  if (fleetP95 <= 0) return false;
  return userSpentToday > fleetP95 * multiple;
}
