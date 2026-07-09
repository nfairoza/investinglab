import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/insights/ledger/build";
import { detectClosures, type PriorOpenInsight } from "@/lib/insights/closure";
import type { LedgerInputs, LedgerTxn } from "@/lib/insights/types";

function txn(p: Partial<LedgerTxn> & { transactionId: string; amount: number; date: string; merchant: string }): LedgerTxn {
  return { accountId: "chk", name: p.merchant, plaidCategory: null, plaidDetailed: null, pending: false, removed: false, ...p } as LedgerTxn;
}

// A ledger where dining was high ($400/mo) then dropped to $120 in the latest
// complete month. Prior insight flagged a $400 baseline.
function inputs(): LedgerInputs {
  const txns: LedgerTxn[] = [
    txn({ transactionId: "d1", amount: 400, date: "2026-01-15", merchant: "Chipotle" }),
    txn({ transactionId: "d2", amount: 400, date: "2026-02-15", merchant: "Chipotle" }),
    txn({ transactionId: "d3", amount: 120, date: "2026-03-15", merchant: "Chipotle" }), // latest complete
    txn({ transactionId: "d4", amount: 10, date: "2026-04-02", merchant: "Chipotle" }),  // partial current
  ];
  return { txns, overrides: [], balances: [], cards: [], netWorthHistory: [] };
}

const NOW = Date.UTC(2026, 3, 10);

describe("detectClosures", () => {
  it("closes a pace insight when the category dropped since flagged", () => {
    const l = buildLedger(inputs(), NOW);
    const prior: PriorOpenInsight[] = [
      { id: "abc", kind: "pace_anomaly", subject: "Food & Dining", slots: { baseline: 400 }, impactPerYear: 3600 },
    ];
    const out = detectClosures(l, prior);
    expect(out).toHaveLength(1);
    expect(out[0].insightId).toBe("abc");
    // drop 400 → 120 = 280/mo saved → 3360/yr captured.
    expect(out[0].savedMonthly).toBe(280);
    expect(out[0].capturedYear).toBe(3360);
    expect(out[0].closureInsight.kind).toBe("closure");
    expect(out[0].closureInsight.positive).toBe(true);
    // No digits in kind (numbers live in slots).
    expect(/[0-9]/.test(out[0].closureInsight.kind)).toBe(false);
  });

  it("does not close when spending stayed high", () => {
    const l = buildLedger({
      txns: [
        txn({ transactionId: "a", amount: 400, date: "2026-01-15", merchant: "Chipotle" }),
        txn({ transactionId: "b", amount: 400, date: "2026-02-15", merchant: "Chipotle" }),
        txn({ transactionId: "c", amount: 390, date: "2026-03-15", merchant: "Chipotle" }),
        txn({ transactionId: "d", amount: 10, date: "2026-04-02", merchant: "Chipotle" }),
      ], overrides: [], balances: [], cards: [], netWorthHistory: [],
    }, NOW);
    const prior: PriorOpenInsight[] = [{ id: "x", kind: "pace_anomaly", subject: "Food & Dining", slots: { baseline: 400 }, impactPerYear: 3600 }];
    expect(detectClosures(l, prior)).toHaveLength(0);
  });

  it("ignores non-closable kinds", () => {
    const l = buildLedger(inputs(), NOW);
    const prior: PriorOpenInsight[] = [{ id: "y", kind: "interest_bleed", subject: "cards", slots: {}, impactPerYear: 900 }];
    expect(detectClosures(l, prior)).toHaveLength(0);
  });
});
