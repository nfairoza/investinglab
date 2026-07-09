// =============================================================================
// F6 — recurring / subscription detection. Pure detector over a user's stored
// Plaid transactions: group by normalized merchant; a merchant is RECURRING when
// it has >= 3 charges at ~monthly (or ~annual) intervals with amount variance
// < 15%. Flags a price increase when the latest charge exceeds the average by
// > 10% ("Netflix went from $15.49 → $17.99"). Pure + unit-tested; the nightly
// job wraps this with I/O.
// =============================================================================

export interface RecurringTxn { merchant: string | null; name: string; amount: number; date: string; removed?: boolean }

export interface RecurringCharge {
  merchant: string;
  cadence: "monthly" | "annual";
  avgAmount: number;
  lastAmount: number;
  lastSeen: string;       // YYYY-MM-DD
  priceIncrease: boolean; // lastAmount > avg by > 10%
  count: number;
}

const DAY_MS = 86_400_000;
const parseDate = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

function normalizeMerchant(t: RecurringTxn): string {
  return (t.merchant ?? t.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function medianGapDays(datesMs: number[]): number {
  const sorted = datesMs.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS);
  if (!gaps.length) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

// Detect recurring charges. `now` injectable for tests.
export function detectRecurring(txns: RecurringTxn[]): RecurringCharge[] {
  const byMerchant = new Map<string, { display: string; txns: RecurringTxn[] }>();
  for (const t of txns) {
    if (t.removed || t.amount <= 0) continue; // expenses only
    const key = normalizeMerchant(t);
    if (!key) continue;
    const entry = byMerchant.get(key) ?? { display: (t.merchant ?? t.name ?? "").trim(), txns: [] };
    entry.txns.push(t);
    byMerchant.set(key, entry);
  }

  const out: RecurringCharge[] = [];
  for (const [, { display, txns: group }] of byMerchant) {
    if (group.length < 3) continue;
    const amounts = group.map((t) => t.amount);
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (avg <= 0) continue;

    // Amount variance < 15% (coefficient of variation).
    const variance = amounts.reduce((s, v) => s + (v - avg) ** 2, 0) / amounts.length;
    const cv = Math.sqrt(variance) / avg;
    if (cv >= 0.15) continue;

    // Cadence from the median gap: ~monthly (20–40d) or ~annual (330–400d).
    const gap = medianGapDays(group.map((t) => parseDate(t.date)));
    const cadence: "monthly" | "annual" | null =
      gap >= 20 && gap <= 40 ? "monthly" : gap >= 330 && gap <= 400 ? "annual" : null;
    if (!cadence) continue;

    const sorted = group.slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const last = sorted[sorted.length - 1];
    const priceIncrease = last.amount > avg * 1.1;

    out.push({
      merchant: display,
      cadence,
      avgAmount: +avg.toFixed(2),
      lastAmount: +last.amount.toFixed(2),
      lastSeen: last.date,
      priceIncrease,
      count: group.length,
    });
  }

  return out.sort((a, b) => b.avgAmount - a.avgAmount);
}

export function monthlyTotal(charges: RecurringCharge[]): number {
  return +charges.reduce((s, c) => s + (c.cadence === "monthly" ? c.avgAmount : c.avgAmount / 12), 0).toFixed(2);
}
