// =============================================================================
// MV1 — Safe-to-Spend. The daily "what can I actually spend" number.
//
//   safeToSpend = liquid checking balance
//               − bills due before the next payday
//               − user buffer
//
// Pure and deterministic (injectable `now`) so it can be golden-tested. All the
// DB assembly (balances, recurring bills, income streams) happens in the API
// route; this module only does the date math + arithmetic. No AI, ever.
//
// Method reference: docs/MONEY_METHOD.md.
// =============================================================================

export type PaydayCadence = "weekly" | "biweekly" | "monthly" | "irregular";

export interface UpcomingBill {
  merchant: string;
  amount: number; // expected charge (positive)
  nextExpected: string; // YYYY-MM-DD — predicted next occurrence
}

export interface IncomeCadence {
  source: string;
  cadence: PaydayCadence;
  lastDate: string; // YYYY-MM-DD — last observed deposit date
  avgAmount: number;
}

export interface SafeToSpendInput {
  liquidBalance: number; // sum of checking/savings available
  bills: UpcomingBill[];
  income: IncomeCadence[];
  buffer: number; // user buffer, default applied by caller
  now: string; // YYYY-MM-DD (today)
}

export interface SafeToSpendResult {
  safeToSpend: number;
  liquidBalance: number;
  buffer: number;
  nextPayday: string | null; // YYYY-MM-DD, or null when irregular
  horizonEnd: string; // the date bills are summed up to (payday or +30d fallback)
  irregularIncome: boolean; // true → no regular payday; 30-day window shown
  billsDueTotal: number;
  billsDue: UpcomingBill[]; // the exact bills counted (evidence)
  daysUntilHorizon: number;
}

const DAY_MS = 86_400_000;
const CADENCE_DAYS: Record<Exclude<PaydayCadence, "irregular">, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30, // approximate; monthly income also handled by calendar roll below
};

function day(d: string): string {
  return String(d).slice(0, 10);
}
function ms(d: string): number {
  return Date.parse(day(d) + "T00:00:00Z");
}
function addDaysISO(d: string, n: number): string {
  return new Date(ms(d) + n * DAY_MS).toISOString().slice(0, 10);
}

// Next occurrence of a stream STRICTLY AFTER `now`, walking forward by cadence
// from the last observed deposit. Monthly rolls by calendar month (keeps the
// day-of-month), others by fixed day count. Returns null for irregular streams.
export function nextPaydayFor(stream: IncomeCadence, now: string): string | null {
  if (stream.cadence === "irregular") return null;
  const nowMs = ms(now);
  if (stream.cadence === "monthly") {
    const [y, m, dd] = day(stream.lastDate).split("-").map(Number);
    let year = y, month = m; // 1-based
    // advance month-by-month until strictly after now
    for (let i = 0; i < 36; i++) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      if (ms(iso) > nowMs) return iso;
    }
    return null;
  }
  const step = CADENCE_DAYS[stream.cadence];
  let d = ms(stream.lastDate);
  // Fast-forward in cadence steps until strictly after now.
  const stepsBehind = Math.ceil((nowMs - d) / (step * DAY_MS));
  if (stepsBehind > 0) d += stepsBehind * step * DAY_MS;
  if (d <= nowMs) d += step * DAY_MS;
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Compute Safe-to-Spend. When at least one income stream has a regular cadence,
 * the horizon is the SOONEST next payday and bills due before it are subtracted.
 * When no regular payday can be detected (irregular income only, or none), we
 * fall back to a rolling 30-day window — never fake a payday.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const now = day(input.now);
  const buffer = Number.isFinite(input.buffer) ? input.buffer : 0;

  // Earliest future payday across all regular streams.
  const paydays = input.income
    .map((s) => nextPaydayFor(s, now))
    .filter((d): d is string => d != null)
    .sort();
  const nextPayday = paydays[0] ?? null;
  const irregularIncome = nextPayday == null;

  const horizonEnd = nextPayday ?? addDaysISO(now, 30);
  const horizonMs = ms(horizonEnd);

  // Bills whose predicted next date is AFTER now and AT/BEFORE the horizon.
  // (A bill already paid / with a past next_expected drops out — no double-count.)
  const nowMs = ms(now);
  const billsDue = input.bills
    .filter((b) => {
      const t = ms(b.nextExpected);
      return t > nowMs && t <= horizonMs;
    })
    .sort((a, b) => a.nextExpected.localeCompare(b.nextExpected));
  const billsDueTotal = round2(billsDue.reduce((s, b) => s + (Number(b.amount) || 0), 0));

  const safeToSpend = round2(input.liquidBalance - billsDueTotal - buffer);

  return {
    safeToSpend,
    liquidBalance: round2(input.liquidBalance),
    buffer,
    nextPayday,
    horizonEnd,
    irregularIncome,
    billsDueTotal,
    billsDue,
    daysUntilHorizon: Math.max(0, Math.round((horizonMs - nowMs) / DAY_MS)),
  };
}

// Build the 30-day cash-flow calendar: one entry per day with any bill or income
// marker, for the horizontal strip. Pure — the component just renders it.
export interface CalendarMarker {
  date: string;
  bills: { merchant: string; amount: number }[];
  income: { source: string; amount: number }[];
}

export function buildCashflowCalendar(input: SafeToSpendInput, days = 30): CalendarMarker[] {
  const now = day(input.now);
  const endMs = ms(addDaysISO(now, days));
  const byDate = new Map<string, CalendarMarker>();
  const get = (d: string) => {
    let m = byDate.get(d);
    if (!m) { m = { date: d, bills: [], income: [] }; byDate.set(d, m); }
    return m;
  };
  for (const b of input.bills) {
    const t = ms(b.nextExpected);
    if (t > ms(now) && t <= endMs) get(b.nextExpected).bills.push({ merchant: b.merchant, amount: Number(b.amount) || 0 });
  }
  for (const s of input.income) {
    const nd = nextPaydayFor(s, now);
    if (nd && ms(nd) <= endMs) get(nd).income.push({ source: s.source, amount: s.avgAmount });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Next-expected date for a recurring bill: last occurrence + one cadence period.
// Used by the recurring cron to backfill recurring_charges.next_expected.
export function nextExpectedFor(lastSeen: string, cadence: "monthly" | "annual"): string {
  if (cadence === "annual") {
    const [y, m, d] = day(lastSeen).split("-").map(Number);
    return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const [y, m, d] = day(lastSeen).split("-").map(Number);
  let year = y, month = m + 1;
  if (month > 12) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
