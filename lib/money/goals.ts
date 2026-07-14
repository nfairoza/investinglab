// =============================================================================
// MV3 — savings goals with honest, deterministic projections.
//
// Cash-flow-only math — NEVER a market-return assumption. Given a goal's target
// amount + date, the current balance toward it, and the trailing monthly funding
// rate, we project a completion date and render the gap as a concrete lever
// (+$X/mo to close it). For investment-linked goals we project on CONTRIBUTIONS
// only and the caller notes "excludes market movement".
//
// Pure + golden-tested; no AI.
// =============================================================================

export interface GoalProjectionInput {
  targetAmount: number;
  targetDate: string | null; // YYYY-MM-DD, optional
  currentAmount: number; // saved toward the goal so far
  monthlyFunding: number; // trailing 3-month funding rate (>= 0)
  now: string; // YYYY-MM-DD
}

export interface GoalProjection {
  remaining: number; // targetAmount − currentAmount (>= 0)
  monthlyFunding: number;
  monthsToGoal: number | null; // at current funding; null if funding <= 0
  projectedDate: string | null; // YYYY-MM-DD; null if never at current rate
  onTrack: boolean | null; // vs targetDate; null when no target date
  monthsEarlyOrLate: number | null; // + = late, − = early, vs targetDate
  requiredMonthly: number | null; // funding needed to hit targetDate; null if no date
  extraNeeded: number | null; // requiredMonthly − monthlyFunding (>0 = shortfall)
  achieved: boolean; // already funded
}

const DAY_MS = 86_400_000;

function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd) / 30; // fractional by day
}

function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const whole = Math.floor(months);
  const fracDays = Math.round((months - whole) * 30);
  const base = new Date(Date.UTC(y, m - 1 + whole, d));
  return new Date(base.getTime() + fracDays * DAY_MS).toISOString().slice(0, 10);
}

export function projectGoal(input: GoalProjectionInput): GoalProjection {
  const remaining = round2(Math.max(0, input.targetAmount - input.currentAmount));
  const funding = Math.max(0, input.monthlyFunding);
  const achieved = remaining <= 0;

  const monthsToGoal = achieved ? 0 : funding > 0 ? remaining / funding : null;
  const projectedDate = monthsToGoal != null ? addMonthsISO(input.now, monthsToGoal) : null;

  let onTrack: boolean | null = null;
  let monthsEarlyOrLate: number | null = null;
  let requiredMonthly: number | null = null;
  let extraNeeded: number | null = null;

  if (input.targetDate) {
    const monthsAvailable = monthsBetween(input.now, input.targetDate);
    requiredMonthly = monthsAvailable > 0 ? round2(remaining / monthsAvailable) : remaining; // due now if past
    extraNeeded = round2(Math.max(0, requiredMonthly - funding));
    if (projectedDate) {
      const late = monthsBetween(input.targetDate, projectedDate); // + = projected after target = late
      monthsEarlyOrLate = Math.round(late);
      onTrack = late <= 0.5; // within ~half a month counts as on track
    } else {
      onTrack = achieved ? true : false; // no funding and not achieved → not on track
    }
  }

  return {
    remaining,
    monthlyFunding: round2(funding),
    monthsToGoal: monthsToGoal != null ? Math.round(monthsToGoal * 10) / 10 : null,
    projectedDate,
    onTrack,
    monthsEarlyOrLate,
    requiredMonthly,
    extraNeeded,
    achieved,
  };
}

// Trailing N-month average savings flow (the default funding rate). Uses only
// completed months; floors at 0 (a negative-savings month doesn't imply the goal
// is un-fundable — it just means no progress that month).
export function trailingFundingRate(monthlySavings: number[], months = 3): number {
  const recent = monthlySavings.slice(-months);
  if (!recent.length) return 0;
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  return Math.max(0, round2(avg));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
