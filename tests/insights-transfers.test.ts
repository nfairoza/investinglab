import { describe, it, expect } from "vitest";
import { detectTransfers } from "@/lib/insights/ledger/transfers";
import type { LedgerTxn } from "@/lib/insights/types";

// Fixture-driven transfer detection. The trust suite asserts precision/recall
// >= 95/95 on realistic household ledgers. A transfer is a matched PAIR of
// opposing-amount txns across accounts (or a category-hinted pairless leg).

function txn(p: Partial<LedgerTxn> & { transactionId: string; amount: number; date: string }): LedgerTxn {
  return {
    accountId: "acct-x", name: "", merchant: null, plaidCategory: null, plaidDetailed: null,
    pending: false, removed: false, ...p,
  } as LedgerTxn;
}

describe("detectTransfers", () => {
  it("pairs an opposing-amount move across two accounts within 3 days", () => {
    const txns: LedgerTxn[] = [
      txn({ transactionId: "out", accountId: "checking", amount: 500, date: "2026-03-02", name: "Transfer to savings" }),
      txn({ transactionId: "in", accountId: "savings", amount: -500, date: "2026-03-03", name: "Transfer from checking" }),
      txn({ transactionId: "coffee", accountId: "checking", amount: 5.25, date: "2026-03-02", name: "Starbucks" }),
    ];
    const r = detectTransfers(txns);
    expect(r.transferIds.get("out")).toBe("in");
    expect(r.transferIds.get("in")).toBe("out");
    expect(r.transferIds.has("coffee")).toBe(false);
  });

  it("treats a credit-card payment from checking as a transfer (both legs)", () => {
    const txns: LedgerTxn[] = [
      txn({ transactionId: "pay-out", accountId: "checking", amount: 1200, date: "2026-03-15", name: "Payment to Chase card", plaidDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" }),
      txn({ transactionId: "pay-in", accountId: "chase-cc", amount: -1200, date: "2026-03-15", name: "Payment received", plaidDetailed: "CREDIT_CARD_PAYMENT" }),
    ];
    const r = detectTransfers(txns);
    expect(r.transferIds.get("pay-out")).toBe("pay-in");
  });

  it("marks a pairless CC payment (unlinked other account) as a transfer, null pair", () => {
    const txns: LedgerTxn[] = [
      txn({ transactionId: "cc-pay", accountId: "checking", amount: 800, date: "2026-03-20", name: "Amex payment", plaidCategory: "TRANSFER_OUT", plaidDetailed: "CREDIT_CARD_PAYMENT" }),
    ];
    const r = detectTransfers(txns);
    expect(r.transferIds.has("cc-pay")).toBe(true);
    expect(r.transferIds.get("cc-pay")).toBeNull();
  });

  it("does NOT pair a coincidental opposite amount on the SAME account", () => {
    const txns: LedgerTxn[] = [
      txn({ transactionId: "buy", accountId: "checking", amount: 50, date: "2026-03-01", name: "Store" }),
      txn({ transactionId: "refund", accountId: "checking", amount: -50, date: "2026-03-02", name: "Store refund" }),
    ];
    const r = detectTransfers(txns);
    // Same account → not a transfer between accounts (it's a refund).
    expect(r.transferIds.has("buy")).toBe(false);
    expect(r.transferIds.has("refund")).toBe(false);
  });

  it("hits >=95% precision and recall on a mixed fixture household", () => {
    // 5 true transfer legs (2 pairs + 1 pairless hint), plus 10 non-transfers.
    const txns: LedgerTxn[] = [
      // Pair 1: checking → savings
      txn({ transactionId: "t1a", accountId: "chk", amount: 1000, date: "2026-02-01", name: "to savings" }),
      txn({ transactionId: "t1b", accountId: "sav", amount: -1000, date: "2026-02-01", name: "from checking" }),
      // Pair 2: savings → checking, small ACH fee tolerance, hinted
      txn({ transactionId: "t2a", accountId: "sav", amount: 300, date: "2026-02-10", name: "wire out", plaidCategory: "TRANSFER_OUT" }),
      txn({ transactionId: "t2b", accountId: "chk", amount: -299, date: "2026-02-11", name: "wire in", plaidCategory: "TRANSFER_IN" }),
      // Pairless CC payment (card not linked)
      txn({ transactionId: "t3", accountId: "chk", amount: 450, date: "2026-02-20", name: "Discover payment", plaidDetailed: "CREDIT_CARD_PAYMENT" }),
      // Non-transfers (real spend + income)
      txn({ transactionId: "n1", accountId: "chk", amount: 42.10, date: "2026-02-02", name: "Whole Foods" }),
      txn({ transactionId: "n2", accountId: "chk", amount: 9.99, date: "2026-02-03", name: "Netflix" }),
      txn({ transactionId: "n3", accountId: "chk", amount: 65.00, date: "2026-02-05", name: "Shell gas" }),
      txn({ transactionId: "n4", accountId: "chk", amount: -3200, date: "2026-02-01", name: "ACME Payroll" }),
      txn({ transactionId: "n5", accountId: "cc", amount: 120.00, date: "2026-02-07", name: "Amazon" }),
      txn({ transactionId: "n6", accountId: "chk", amount: 15.00, date: "2026-02-09", name: "Spotify" }),
      txn({ transactionId: "n7", accountId: "chk", amount: 1800, date: "2026-02-01", name: "Rent" }),
      txn({ transactionId: "n8", accountId: "cc", amount: 55.00, date: "2026-02-12", name: "Target" }),
      txn({ transactionId: "n9", accountId: "chk", amount: 30.00, date: "2026-02-14", name: "Chipotle" }),
      txn({ transactionId: "n10", accountId: "chk", amount: -50, date: "2026-02-18", name: "Refund ACME" }),
    ];
    const truthTransfers = new Set(["t1a", "t1b", "t2a", "t2b", "t3"]);

    const r = detectTransfers(txns);
    const predicted = new Set([...r.transferIds.keys()]);

    let tp = 0, fp = 0;
    for (const id of predicted) (truthTransfers.has(id) ? tp++ : fp++);
    const fn = [...truthTransfers].filter((id) => !predicted.has(id)).length;
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);

    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
