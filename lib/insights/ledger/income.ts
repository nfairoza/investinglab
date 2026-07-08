import type { LedgerTxn, IncomeStream } from "../types";

// =============================================================================
// Income detection. A deposit (amount < 0 in Plaid's convention) is only treated
// as INCOME if it recurs with cadence + amount stability. Irregular one-off
// deposits (refunds, gifts, reimbursements) are flagged separately and NEVER
// assumed to be income — over-counting income would understate every spending
// pace and overstate savings capacity.
//
// Transfers must already be removed by the caller (detectTransfers) before this
// runs — a transfer IN is not income.
// =============================================================================

const monthKey = (iso: string) => iso.slice(0, 7);
const parseDate = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const DAY_MS = 86_400_000;

// Classify the cadence of a source from the median gap between its deposits.
function cadenceOf(datesMs: number[]): IncomeStream["cadence"] {
  if (datesMs.length < 2) return "irregular";
  const sorted = datesMs.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push((sorted[i] - sorted[i - 1]) / DAY_MS);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (median <= 9) return "weekly";
  if (median <= 18) return "biweekly";
  if (median <= 45) return "monthly";
  return "irregular";
}

export interface IncomeResult {
  streams: IncomeStream[];
  // transactionId → true when this deposit belongs to a recurring income stream.
  incomeTxnIds: Set<string>;
}

// `nonTransferDeposits` = deposits (amount < 0) already stripped of transfers.
export function detectIncome(nonTransferDeposits: LedgerTxn[]): IncomeResult {
  const bySource = new Map<string, LedgerTxn[]>();
  for (const t of nonTransferDeposits) {
    if (t.removed || t.amount >= 0) continue;
    const src = (t.merchant ?? t.name ?? "").trim();
    if (!src) continue;
    const arr = bySource.get(src) ?? [];
    arr.push(t);
    bySource.set(src, arr);
  }

  const streams: IncomeStream[] = [];
  const incomeTxnIds = new Set<string>();

  for (const [source, txns] of bySource) {
    // Group by month, using the largest deposit that month so two paychecks in
    // one month don't distort the average.
    const byMonth = new Map<string, LedgerTxn>();
    for (const t of txns) {
      const mk = monthKey(t.date);
      const cur = byMonth.get(mk);
      if (!cur || Math.abs(t.amount) > Math.abs(cur.amount)) byMonth.set(mk, t);
    }
    const monthsObserved = byMonth.size;
    // Recurring income = present in >= 3 distinct months and meaningfully sized.
    if (monthsObserved < 3) continue;
    const amounts = [...byMonth.values()].map((t) => Math.abs(t.amount));
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (avg < 200) continue; // ignore small incidental deposits

    const datesMs = txns.map((t) => parseDate(t.date));
    const cadence = cadenceOf(datesMs);
    const lastSeen = [...byMonth.keys()].sort().at(-1)!;
    streams.push({ source, cadence, avgAmount: +avg.toFixed(2), lastSeen, monthsObserved });
    for (const t of txns) incomeTxnIds.add(t.transactionId);
  }

  streams.sort((a, b) => b.avgAmount - a.avgAmount);
  return { streams, incomeTxnIds };
}
