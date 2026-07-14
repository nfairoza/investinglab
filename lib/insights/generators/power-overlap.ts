import type { StructuredInsight } from "../types";
import { computeOverlap, type OverlapHolding, type OverlapTrade } from "@/lib/power-trades/overlap";

// PT6 — power-overlap insight. "Someone you follow traded a stock you own." Fed
// the user's follows + holdings + recent followed-person trades by the nightly
// run (DB access), so it flows into Home cards + the digest under the standard
// governor/cooldown. Deterministic; numbers in slots only.

export function detectPowerOverlap(
  followedNames: string[],
  holdings: OverlapHolding[],
  recentTrades: OverlapTrade[],
): StructuredInsight[] {
  const matches = computeOverlap(followedNames, holdings, recentTrades);
  if (matches.length === 0) return [];
  // Surface the single most relevant match (highest held value); the full list
  // lives on the Power Trades overlap card. One insight avoids flooding.
  const m = matches[0];
  return [{
    kind: "power_overlap",
    subject: `${m.personName}:${m.ticker}`,
    severity: 1,
    headlineSlots: { person: m.personName, ticker: m.ticker, action: m.type === "buy" ? "bought" : "sold", held: Math.round(m.heldValue) },
    impactPerYear: null,
    evidence: [{ kind: "inputs", inputs: { person: m.personName, ticker: m.ticker, type: m.type, heldValue: Math.round(m.heldValue), amount: m.amountLabel ?? "n/a" }, note: `${m.personName} ${m.type === "buy" ? "bought" : "sold"} ${m.ticker}${m.amountLabel ? ` (${m.amountLabel})` : ""}; you hold about ${Math.round(m.heldValue)}.` }],
    factsUsed: ["overlap.v1"],
    action: { label: "See Power Trades", deeplink: "/power-trades?tab=flow" },
    cooldownDays: 14,
    page: "power",
  }];
}
