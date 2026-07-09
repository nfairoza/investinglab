import type { StructuredInsight } from "../types";

// =============================================================================
// F8 delta — concentration insight. Not part of the transaction Ledger (it reads
// holdings), so it's a standalone generator the nightly job runs with a priced
// holdings list. Pure + testable. "NVDA is 31% of your portfolio" — observational,
// never prescriptive. Numbers live in headlineSlots per the engine's law.
// =============================================================================

export interface PricedHolding { symbol: string; value: number }

export function detectConcentration(holdings: PricedHolding[]): StructuredInsight[] {
  const total = holdings.reduce((s, h) => s + (h.value > 0 ? h.value : 0), 0);
  if (total <= 0) return [];
  const top = holdings.filter((h) => h.value > 0).sort((a, b) => b.value - a.value)[0];
  if (!top) return [];
  const pct = (top.value / total) * 100;
  // Non-trivial: a single position over 25% of the portfolio.
  if (pct < 25) return [];
  return [{
    kind: "concentration",
    subject: top.symbol,
    severity: pct >= 40 ? 2 : 1,
    headlineSlots: { symbol: top.symbol, pct: Math.round(pct), value: Math.round(top.value) },
    impactPerYear: null, // concentration is a risk observation, not a $ figure
    evidence: [{
      kind: "inputs",
      inputs: { symbol: top.symbol, positionValue: Math.round(top.value), portfolioValue: Math.round(total) },
      note: `${top.symbol} is about ${Math.round(pct)}% of your ${Math.round(total).toLocaleString("en-US")} portfolio.`,
    }],
    factsUsed: ["concentration.v1"],
    action: { label: "See your holdings", deeplink: "/holdings" },
    cooldownDays: 30,
    page: "holdings",
  }];
}
