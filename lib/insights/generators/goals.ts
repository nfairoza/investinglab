import type { StructuredInsight } from "../types";
import { projectGoal } from "@/lib/money/goals";

// MV3 — goal-drift insight. Fed the user's goals + current funding by the nightly
// run (DB access). Fires when a goal with a target date is projected to land
// materially late and there's a concrete monthly lever to fix it. Deterministic;
// governor + cooldown keep it from nagging.

export interface GoalRow {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  currentAmount: number;
}

export function detectGoalDrift(goals: GoalRow[], monthlyFunding: number, now: string): StructuredInsight[] {
  const out: StructuredInsight[] = [];
  for (const g of goals) {
    if (!g.targetDate) continue;
    const p = projectGoal({ targetAmount: g.targetAmount, targetDate: g.targetDate, currentAmount: g.currentAmount, monthlyFunding, now });
    // Only fire when meaningfully behind (2+ months late) AND there's a lever.
    if (p.achieved) continue;
    if (p.monthsEarlyOrLate == null || p.monthsEarlyOrLate < 2) continue;
    if (p.extraNeeded == null || p.extraNeeded <= 0) continue;
    out.push({
      kind: "goal_drift",
      subject: g.id,
      severity: p.monthsEarlyOrLate >= 6 ? 2 : 1,
      headlineSlots: { name: g.name, monthsLate: p.monthsEarlyOrLate, extra: p.extraNeeded },
      impactPerYear: null,
      evidence: [{ kind: "inputs", inputs: { target: g.targetAmount, saved: g.currentAmount, monthlyFunding, requiredMonthly: p.requiredMonthly ?? 0 }, note: `${g.name}: at ${monthlyFunding}/mo you're ~${p.monthsEarlyOrLate} months past the target date; +${p.extraNeeded}/mo closes it.` }],
      factsUsed: ["goal.v1"],
      action: { label: "See goals", deeplink: "/goals" },
      cooldownDays: 21,
      page: "money",
    });
  }
  return out;
}
