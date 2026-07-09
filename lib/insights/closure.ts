import type { Ledger, StructuredInsight } from "./types";
import { categoryTrend } from "./facts";

// =============================================================================
// Stage-4 closure loop (pure). Given a prior open spending insight and the fresh
// ledger, decide whether the user followed through — spending on that category
// has dropped meaningfully vs when we flagged it. If so, produce BOTH a
// celebratory closure insight and the captured $/yr for the trust ledger.
//
// Pure + testable; the nightly job supplies prior insights and persists results.
// Only spending-category insights auto-close from data here (paid-down balances
// and automated transfers are future detectors — noted, not faked).
// =============================================================================

export interface PriorOpenInsight {
  id: string;
  kind: string;        // "pace_anomaly" | "category_trend"
  subject: string;     // the category
  slots: Record<string, number | string>;
  impactPerYear: number | null;
}

export interface ClosureResult {
  insightId: string;
  kind: string;
  subject: string;
  capturedYear: number;   // annualized $ kept
  savedMonthly: number;
  downPct: number;
  closureInsight: StructuredInsight;
}

const CLOSABLE = new Set(["pace_anomaly", "category_trend"]);

// Detect follow-through for the prior open insights against the fresh ledger.
export function detectClosures(l: Ledger, prior: PriorOpenInsight[]): ClosureResult[] {
  const out: ClosureResult[] = [];
  for (const p of prior) {
    if (!CLOSABLE.has(p.kind)) continue;
    const category = p.subject;
    // The baseline we flagged against (fallback to current fact baseline).
    const t = categoryTrend(l, category).value;
    const flaggedBaseline = typeof p.slots.baseline === "number" ? p.slots.baseline : t.baseline;
    if (flaggedBaseline <= 0) continue;

    const latest = t.latest; // latest complete month for the category
    const drop = flaggedBaseline - latest;
    const downPct = (drop / flaggedBaseline) * 100;
    // Followed through: latest is at least 15% below the flagged baseline and a
    // non-trivial dollar drop.
    if (downPct < 15 || drop < 50) continue;

    const savedMonthly = +drop.toFixed(2);
    const capturedYear = +(drop * 12).toFixed(2);
    out.push({
      insightId: p.id,
      kind: p.kind,
      subject: category,
      capturedYear,
      savedMonthly,
      downPct: +downPct.toFixed(1),
      closureInsight: {
        kind: "closure",
        subject: category,
        severity: 1,
        headlineSlots: { category, savedMonthly, capturedYear, downPct: Math.round(downPct) },
        impactPerYear: capturedYear,
        evidence: [{
          kind: "inputs",
          inputs: { category, flaggedBaseline: +flaggedBaseline.toFixed(2), latest: +latest.toFixed(2) },
          note: `${category} fell from about ${flaggedBaseline.toFixed(0)} to ${latest.toFixed(0)} a month since we flagged it.`,
        }],
        factsUsed: ["categoryTrend.v1"],
        action: { label: "See spending", deeplink: "/spending" },
        cooldownDays: 60,
        positive: true,
        page: "spending",
      },
    });
  }
  return out;
}
