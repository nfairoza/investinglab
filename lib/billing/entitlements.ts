// Entitlements / plan gating (pure, shared by server + client). There is no
// payment integration yet, so a MASTER SWITCH ships every gated feature to ALL
// users until an admin turns billing on. The tier machinery is real so flipping
// the switch later needs no feature rewrites — only the gate goes live.
//
// docs/BILLING.md holds the human-readable feature→tier matrix.

export type Plan = "free" | "premium" | "pro";

// Feature keys that are plan-gated. Add here as gated features ship.
export type Feature =
  | "etf_lookthrough"   // ETF look-through toggle + insight (Premium)
  | "pt_flow_views"     // Power Trades flow views (Premium)
  | "pt_cluster_alerts" // Real-time insider-cluster alerts (Pro)
  | "safe_to_spend"     // Money V2 Safe-to-Spend hero (Premium)
  | "money_targets"     // Money V2 category targets (Premium)
  | "money_goals"       // Money V2 savings goals (Premium)
  | "plaid_link";       // Linking a bank via Plaid — free tier excludes it (Premium)

// The minimum plan each feature requires.
const FEATURE_MIN_PLAN: Record<Feature, Plan> = {
  etf_lookthrough: "premium",
  pt_flow_views: "premium",
  pt_cluster_alerts: "pro",
  safe_to_spend: "premium",
  money_targets: "premium",
  money_goals: "premium",
  plaid_link: "premium",
};

const PLAN_RANK: Record<Plan, number> = { free: 0, premium: 1, pro: 2 };

// MASTER SWITCH. While false (the default), billing is OFF and every gated feature
// is available to everyone — the product ships fully until an admin enables billing
// by setting BILLING_ENABLED=1 in the environment. When true, real plan tiers apply.
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "1" || process.env.NEXT_PUBLIC_BILLING_ENABLED === "1";
}

// Normalize an arbitrary plan string (from app_metadata) to a known tier.
export function normalizePlan(raw: unknown): Plan {
  const p = String(raw ?? "").toLowerCase();
  return p === "pro" || p === "premium" ? p : "free";
}

// Does a user on `plan` (admins are treated as `pro`) get `feature`? When billing
// is disabled, always true. This is the single gate used server- and client-side.
export function isEntitled(feature: Feature, plan: Plan, isAdmin = false): boolean {
  if (!billingEnabled()) return true;         // billing off → everyone gets it
  if (isAdmin) return true;                    // admins always entitled (QA)
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function minPlanFor(feature: Feature): Plan {
  return FEATURE_MIN_PLAN[feature];
}
