import type { LedgerTxn, ObligationKind } from "../types";
import { categorize } from "@/lib/money/categorize";

// =============================================================================
// Obligation classification — fixed vs discretionary spending.
//
// FIXED = a recurring charge with low variance whose category is inherently an
// obligation (rent/mortgage, loan payments, insurance, core utilities). We
// require BOTH the category signal AND recurrence (>= 3 months, low coefficient
// of variation) so a one-off insurance-adjacent purchase isn't miscounted.
// Everything else that is spending is DISCRETIONARY. Reuses the same category
// mapping the rest of the app uses (lib/money/categorize.ts) so classifications
// never drift from what the user sees.
//
// Pure + deterministic. User reclassification is applied by the caller (sticky
// overrides win); this is only the DEFAULT.
// =============================================================================

const monthKey = (iso: string) => iso.slice(0, 7);

// Categories that are obligations WHEN they recur.
const FIXED_CATEGORIES = new Set(["Rent & Mortgage", "Loan Payments", "Bills & Utilities"]);
// Insurance lives under Bills & Utilities in categorize(); the merchant hint
// keeps genuinely-fixed insurance in the fixed bucket even if variable.
const INSURANCE_HINT = /insurance|geico|progressive|state farm|allstate|policy/i;

export interface ObligationResult {
  // transactionId → fixed | discretionary | null (null = not spending, e.g. income/transfer)
  kinds: Map<string, ObligationKind>;
}

// `spendTxns` = expenses (amount > 0) already stripped of transfers.
export function classifyObligations(spendTxns: LedgerTxn[]): ObligationResult {
  const kinds = new Map<string, ObligationKind>();

  // Group by merchant to measure recurrence + variance.
  const byMerchant = new Map<string, LedgerTxn[]>();
  for (const t of spendTxns) {
    if (t.removed || t.amount <= 0) continue;
    const m = (t.merchant ?? t.name ?? "Unknown").trim();
    const arr = byMerchant.get(m) ?? [];
    arr.push(t);
    byMerchant.set(m, arr);
  }

  // Which merchants qualify as fixed obligations.
  const fixedMerchants = new Set<string>();
  for (const [merchant, txns] of byMerchant) {
    const cat = categorize({ merchant: txns[0].merchant, name: txns[0].name, plaidDetailed: txns[0].plaidDetailed, plaidPrimary: txns[0].plaidCategory });
    const insurance = INSURANCE_HINT.test(merchant.toLowerCase());
    if (!FIXED_CATEGORIES.has(cat) && !insurance) continue;

    const months = new Set(txns.map((t) => monthKey(t.date)));
    if (months.size < 3) continue; // must recur

    // Low variance: coefficient of variation of the monthly total <= 15%.
    const byMonth = new Map<string, number>();
    for (const t of txns) byMonth.set(monthKey(t.date), (byMonth.get(monthKey(t.date)) ?? 0) + t.amount);
    const vals = [...byMonth.values()];
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    // Rent/mortgage/loans are fixed even with mild variance; utilities allowed more.
    const cap = cat === "Bills & Utilities" ? 0.35 : 0.15;
    if (cv <= cap) fixedMerchants.add(merchant);
  }

  for (const [merchant, txns] of byMerchant) {
    const kind: ObligationKind = fixedMerchants.has(merchant) ? "fixed" : "discretionary";
    for (const t of txns) kinds.set(t.transactionId, kind);
  }

  return { kinds };
}
