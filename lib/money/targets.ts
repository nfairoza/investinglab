// =============================================================================
// MV2 — category targets. Pure math for target suggestions + progress/pace.
//
// Targets are OPT-IN intent: the app suggests a target from the user's OWN
// spending (p50 of the trailing 3 months, rounded), and the user accepts/edits/
// skips. Nothing here auto-creates a target; this module only computes numbers.
// Deterministic + golden-tested; no AI.
// =============================================================================

export interface MonthlyCategorySpend {
  month: string; // YYYY-MM
  category: string;
  total: number; // total spent in that category that month (positive)
}

export interface TargetSuggestion {
  category: string;
  p50: number; // median of the trailing months
  suggested: number; // rounded suggestion
  monthsUsed: number;
}

// Median of a numeric list (p50). Even count → average of the two middle values.
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Round a dollar suggestion to a friendly increment: nearest $25 under $500,
// nearest $50 above. Keeps "dining typically $410 → set $375?" style numbers.
export function roundSuggestion(v: number): number {
  if (v <= 0) return 0;
  const step = v < 500 ? 25 : 50;
  return Math.round(v / step) * step;
}

/**
 * Suggest a monthly target per category from the trailing N completed months of
 * category spend. Uses p50 (median) so one blowout month doesn't inflate it.
 * Only categories with at least `minMonths` of data get a suggestion.
 */
export function suggestTargets(
  history: MonthlyCategorySpend[],
  opts: { months?: number; minMonths?: number } = {},
): TargetSuggestion[] {
  const months = opts.months ?? 3;
  const minMonths = opts.minMonths ?? 2;

  // The most recent `months` completed months present in the data.
  const monthKeys = Array.from(new Set(history.map((h) => h.month))).sort();
  const recent = new Set(monthKeys.slice(-months));

  const byCat = new Map<string, number[]>();
  for (const h of history) {
    if (!recent.has(h.month)) continue;
    (byCat.get(h.category) ?? byCat.set(h.category, []).get(h.category)!).push(h.total);
  }

  const out: TargetSuggestion[] = [];
  for (const [category, totals] of byCat) {
    if (totals.length < minMonths) continue;
    const p50 = median(totals);
    if (p50 <= 0) continue;
    out.push({ category, p50: round2(p50), suggested: roundSuggestion(p50), monthsUsed: totals.length });
  }
  return out.sort((a, b) => b.p50 - a.p50);
}

export type Pace = "ahead" | "on" | "behind";

export interface TargetProgress {
  category: string;
  target: number;
  spent: number; // month-to-date
  ratio: number; // spent / target (for the ring)
  pace: Pace; // relative to day-of-month expectation
  projected: number; // linear projection to month end
  expectedByNow: number; // target * fraction of month elapsed
}

// Fraction of the month elapsed by end of `dayOfMonth` (day 1 counts as 1 day in).
export function monthElapsedFraction(dayOfMonth: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 1;
  return Math.min(1, Math.max(0, dayOfMonth / daysInMonth));
}

/**
 * Month-to-date progress + pace for one targeted category. `pace`:
 *   - behind budget (good) → spending slower than the day-of-month would imply
 *   - ahead of budget (concerning) → spending faster; will overshoot
 * We label from the SPENDING perspective: "ahead" = ahead of pace = overspending.
 */
export function targetProgress(
  category: string,
  target: number,
  spentMtd: number,
  dayOfMonth: number,
  daysInMonth: number,
): TargetProgress {
  const frac = monthElapsedFraction(dayOfMonth, daysInMonth);
  const expectedByNow = round2(target * frac);
  const projected = frac > 0 ? round2(spentMtd / frac) : spentMtd;
  // 5% tolerance band around the expected line = "on" pace.
  const tol = Math.max(1, target * 0.05);
  let pace: Pace = "on";
  if (spentMtd > expectedByNow + tol) pace = "ahead"; // overspending
  else if (spentMtd < expectedByNow - tol) pace = "behind"; // underspending (good)
  return {
    category,
    target,
    spent: round2(spentMtd),
    ratio: target > 0 ? spentMtd / target : 0,
    pace,
    projected,
    expectedByNow,
  };
}

// End-of-month result for the target-month-result generator: over/under + streak
// handled by the caller. Positive when spent <= target.
export interface MonthResult {
  category: string;
  target: number;
  spent: number;
  delta: number; // target − spent (positive = under budget)
  under: boolean;
}

export function monthResult(category: string, target: number, spent: number): MonthResult {
  const delta = round2(target - spent);
  return { category, target, spent: round2(spent), delta, under: delta >= 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
