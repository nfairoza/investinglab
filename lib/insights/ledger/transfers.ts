import type { LedgerTxn } from "../types";

// =============================================================================
// Transfer detection — the make-or-break of the Ledger. Money moving BETWEEN a
// user's own accounts is not spending or income; counting it as either poisons
// every downstream fact. We detect a transfer as a matched PAIR of opposing-
// amount transactions across two of the user's accounts within a short window.
//
// Signals, strongest first:
//   1. Opposing amounts (one out, one in) of equal magnitude (or within a small
//      fee tolerance) on DIFFERENT accounts, dated within ±3 days.
//   2. Plaid category hints: TRANSFER_IN / TRANSFER_OUT / CREDIT_CARD_PAYMENT.
//      A credit-card payment from checking is a transfer — the SPENDING already
//      happened as the card swipes; the payment must not be double-counted.
//
// A pair requires the amount signal; category hints only widen the fee tolerance
// and break ties. Single-leg category hints (e.g. a CC payment whose opposing
// leg isn't in our data because that account isn't linked) are marked as a
// transfer too, but flagged pairless so the caller can note "unlinked account
// suspected" rather than silently dropping money.
// =============================================================================

export interface TransferResult {
  // transactionId → matched opposing leg id (or null for a pairless hint match).
  transferIds: Map<string, string | null>;
}

const DAY_MS = 86_400_000;
const parseDate = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

// Fee tolerance: exact match, or within max($1, 1%) when a category hint backs it
// (wire/ACH fees, rounding). Without a hint we require near-exact to avoid false
// pairs between coincidental opposite amounts.
function amountsMatch(a: number, b: number, hinted: boolean): boolean {
  const magA = Math.abs(a), magB = Math.abs(b);
  const diff = Math.abs(magA - magB);
  const tol = hinted ? Math.max(1, magA * 0.01) : Math.max(0.01, magA * 0.001);
  return diff <= tol;
}

const CATEGORY_HINT = /TRANSFER_IN|TRANSFER_OUT|CREDIT_CARD_PAYMENT|ACCOUNT_TRANSFER|WIRE/i;
// STRUCTURED category signal from Plaid — reliable enough to mark a transfer even
// WITHOUT a matching opposite leg (pass 2, pairless).
function isCategoryHint(t: LedgerTxn): boolean {
  return CATEGORY_HINT.test(`${t.plaidCategory ?? ""} ${t.plaidDetailed ?? ""}`);
}
// NAME signals that a txn LOOKS like a transfer. These are NARROW, transfer-
// specific phrases only. Deliberately EXCLUDES generic bank verbs like "ach",
// "payment", "deposit", "withdrawal" — real income/spending is named exactly
// those ("ACH DEPOSIT PAYROLL", "ONLINE PAYMENT", "POS WITHDRAWAL"), and marking
// them as transfers silently zeroed real cash flow out of the Sankey.
const NAME_HINT = /\b(transfer|xfer|to savings|from savings|to checking|from checking|autopay|auto ?pay|card ?payment|bill ?pay|zelle|venmo)\b/i;
function isNameHint(t: LedgerTxn): boolean {
  return NAME_HINT.test(`${t.name ?? ""} ${t.merchant ?? ""}`);
}
// Combined hint used ONLY for PAIRING (pass 1), where a matching equal-and-
// opposite leg corroborates the name — so a loose name match can't cause a false
// transfer on its own.
function isHint(t: LedgerTxn): boolean {
  return isCategoryHint(t) || isNameHint(t);
}

// Detect transfers over a list of the user's transactions. Pure + deterministic:
// iteration order is stabilized by (date, transactionId) so the same input always
// yields the same pairing.
export function detectTransfers(txns: LedgerTxn[]): TransferResult {
  const transferIds = new Map<string, string | null>();
  const live = txns
    .filter((t) => !t.removed)
    .slice()
    .sort((a, b) => parseDate(a.date) - parseDate(b.date) || a.transactionId.localeCompare(b.transactionId));

  const used = new Set<string>();

  // Pass 1 — pair opposing amounts across different accounts within ±3 days.
  // Prefer hinted, closest-in-time, exact-amount matches first.
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    if (used.has(a.transactionId)) continue;

    let best: { leg: LedgerTxn; score: number } | null = null;
    for (let j = 0; j < live.length; j++) {
      if (i === j) continue;
      const b = live[j];
      if (used.has(b.transactionId)) continue;
      // Opposing directions (one positive/out, one negative/in).
      if (Math.sign(a.amount) === Math.sign(b.amount)) continue;
      if (a.amount === 0 || b.amount === 0) continue;
      // Different accounts (a transfer moves money between two accounts). If
      // account ids are missing we still allow it but score it lower.
      const sameAcct = a.accountId && b.accountId && a.accountId === b.accountId;
      if (sameAcct) continue;
      const dayGap = Math.abs(parseDate(a.date) - parseDate(b.date)) / DAY_MS;
      if (dayGap > 3) continue;
      const hinted = isHint(a) || isHint(b);
      // Only pair when a Plaid category HINT backs the transfer. A pure amount
      // coincidence (e.g. a $1,800 paycheck landing near an $1,800 rent charge)
      // is NOT a transfer — pairing it silently zeroed real income/spending in the
      // cash-flow. Hinted pairs (TRANSFER_*/CREDIT_CARD_PAYMENT) are the real ones.
      if (!hinted) continue;
      if (!amountsMatch(a.amount, b.amount, hinted)) continue;

      // Lower score is better: prefer smaller day gap, exact amount, hinted.
      const exact = Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) < 0.01 ? 0 : 1;
      const knownAcct = a.accountId && b.accountId ? 0 : 1;
      const score = dayGap * 4 + exact * 2 + (hinted ? 0 : 3) + knownAcct;
      if (!best || score < best.score) best = { leg: b, score };
    }

    if (best) {
      transferIds.set(a.transactionId, best.leg.transactionId);
      transferIds.set(best.leg.transactionId, a.transactionId);
      used.add(a.transactionId);
      used.add(best.leg.transactionId);
    }
  }

  // Pass 2 — pairless CATEGORY hints ONLY. A CREDIT_CARD_PAYMENT / TRANSFER_*
  // whose opposing leg isn't in our data (the other account isn't linked) is
  // still a transfer, not spending. We require Plaid's STRUCTURED category here —
  // NOT a name match — because a name like "ACH DEPOSIT" or "ONLINE PAYMENT" with
  // no matching opposite leg is almost always real income/spending, and marking
  // it pairless silently zeroed the user's cash flow out of the Sankey.
  for (const t of live) {
    if (used.has(t.transactionId)) continue;
    if (isCategoryHint(t)) {
      transferIds.set(t.transactionId, null);
      used.add(t.transactionId);
    }
  }

  return { transferIds };
}
