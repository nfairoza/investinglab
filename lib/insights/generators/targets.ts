import type { Ledger, StructuredInsight } from "../types";
import { pace } from "../facts";
import { targetProgress, monthResult } from "@/lib/money/targets";

// MV2 — target-aware spending insights. Fed the user's category_targets by the
// nightly run (DB access), so these live outside the pure ledger-only generator
// set (like concentration). Still deterministic: numbers computed here, narrator
// only slots them.

export interface TargetInput {
  category: string;
  target: number;
}

// Pace against the TARGET (not the rolling baseline) — fires when the projected
// month-end spend is over the target by a meaningful margin. Replaces the
// baseline pace phrasing for any category the user has set a target on.
export function detectTargetPace(l: Ledger, targets: TargetInput[], now = new Date()): StructuredInsight[] {
  const curMonth = now.toISOString().slice(0, 7);
  const cur = l.months.find((m) => m.month === curMonth);
  if (!cur) return [];
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();

  const out: StructuredInsight[] = [];
  for (const t of targets) {
    if (t.target <= 0) continue;
    const spent = cur.byCategory[t.category] ?? 0;
    const p = targetProgress(t.category, t.target, spent, dayOfMonth, daysInMonth);
    // Only nudge when clearly on track to overshoot the target (projected >110%).
    if (p.projected <= t.target * 1.1) continue;
    const over = +(p.projected - t.target).toFixed(2);
    const f = pace(l, t.category);
    out.push({
      kind: "target_pace",
      subject: t.category,
      severity: p.projected >= t.target * 1.4 ? 2 : 1,
      headlineSlots: { category: t.category, projected: p.projected, target: t.target, over },
      impactPerYear: +(over * 12).toFixed(2),
      evidence: [f.evidence, { kind: "inputs", inputs: { target: t.target, spentSoFar: p.spent, projected: p.projected }, note: `${t.category} projected ${p.projected} vs your ${t.target} target.` }],
      factsUsed: [f.formulaId, "target.v1"],
      action: { label: `See ${t.category} spending`, deeplink: "/spending" },
      cooldownDays: 14,
      page: "spending",
    });
  }
  return out.sort((a, b) => (b.impactPerYear ?? 0) - (a.impactPerYear ?? 0)).slice(0, 2);
}

// End-of-month result: one insight per targeted category for the JUST-COMPLETED
// month. Honest both ways — under target gets the positive-reinforcement voice,
// over gets a gentle heads-up. `streakMonths` (consecutive unders) passed in by
// the caller for the "3 months running" framing.
export function detectTargetMonthResult(
  l: Ledger,
  targets: TargetInput[],
  streakByCategory: Record<string, number> = {},
  now = new Date(),
): StructuredInsight[] {
  // The most recent COMPLETED month = last month.
  const lastMonthDate = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const m = l.months.find((x) => x.month === lastMonth);
  if (!m) return [];

  const out: StructuredInsight[] = [];
  for (const t of targets) {
    if (t.target <= 0) continue;
    const spent = m.byCategory[t.category] ?? 0;
    // Skip categories with no activity that month (nothing to report).
    if (spent <= 0) continue;
    const r = monthResult(t.category, t.target, spent);
    const streak = streakByCategory[t.category] ?? (r.under ? 1 : 0);
    out.push({
      kind: "target_month_result",
      subject: `${t.category}:${lastMonth}`,
      severity: 1,
      positive: r.under,
      headlineSlots: { category: t.category, target: t.target, spent: r.spent, delta: Math.abs(r.delta), streak },
      impactPerYear: null,
      evidence: [{ kind: "inputs", inputs: { month: lastMonth, target: t.target, spent: r.spent }, note: `${t.category} ${r.under ? "under" : "over"} target by ${Math.abs(r.delta)} in ${lastMonth}.` }],
      factsUsed: ["target.v1"],
      action: { label: "See spending", deeplink: "/spending" },
      cooldownDays: 25, // once per month per category
      page: "spending",
    });
  }
  return out;
}
