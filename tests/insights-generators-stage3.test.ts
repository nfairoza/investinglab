import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/insights/ledger/build";
import {
  detectIdleCash, detectUtilization, detectLowBuffer, detectSavingsCapacity, detectCategoryTrend,
} from "@/lib/insights/generators";
import { utilization } from "@/lib/insights/facts";
import type { LedgerInputs, LedgerTxn } from "@/lib/insights/types";

function txn(p: Partial<LedgerTxn> & { transactionId: string; amount: number; date: string; merchant: string }): LedgerTxn {
  return { accountId: "chk", name: p.merchant, plaidCategory: null, plaidDetailed: null, pending: false, removed: false, ...p } as LedgerTxn;
}

// Base ledger: 3 prior months of $200 dining, big liquid cash, one high-util card.
function inputs(overrides: Partial<LedgerInputs> = {}): LedgerInputs {
  const txns: LedgerTxn[] = [];
  for (const m of ["2026-01-15", "2026-02-15", "2026-03-15"]) txns.push(txn({ transactionId: `dine-${m}`, amount: 200, date: m, merchant: "Chipotle" }));
  // income so savings capacity has something to work with
  for (const m of ["2026-01-01", "2026-02-01", "2026-03-01"]) txns.push(txn({ transactionId: `pay-${m}`, amount: -5000, date: m, merchant: "ACME Payroll" }));
  return {
    txns, overrides: [],
    balances: [{ accountId: "chk", name: "Checking", type: "depository", subtype: "checking", current: 8000, available: 8000, isLiquid: true }],
    cards: [{ accountId: "cc1", name: "Visa", balance: 4000, limit: 8000, apr: 24 }],
    netWorthHistory: [],
    ...overrides,
  };
}

const NOW = Date.UTC(2026, 3, 10);

describe("detectIdleCash", () => {
  it("fires with idle cash beyond buffer", () => {
    const l = buildLedger(inputs(), NOW);
    const out = detectIdleCash(l);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("idle_cash");
    expect(out[0].impactPerYear).toBeNull(); // option framing, no assumed return
    expect(Number(out[0].headlineSlots.idle)).toBeGreaterThan(2000);
  });
});

describe("detectUtilization", () => {
  it("fires at 50% utilization (4000/8000) with step severity", () => {
    const l = buildLedger(inputs(), NOW);
    expect(utilization(l).value.totalUtil).toBe(50);
    const out = detectUtilization(l);
    expect(out).toHaveLength(1);
    expect(out[0].headlineSlots.totalUtil).toBe(50);
    expect(out[0].severity).toBe(2); // >=50 step
  });
  it("does not fire under 30%", () => {
    const l = buildLedger(inputs({ cards: [{ accountId: "c", name: "V", balance: 1000, limit: 10000, apr: 20 }] }), NOW);
    expect(detectUtilization(l)).toHaveLength(0);
  });
});

describe("detectLowBuffer", () => {
  it("fires (severity 3) when runway < 1 month", () => {
    // Tiny cash vs the $200/mo outflow → under 1 month.
    const l = buildLedger(inputs({ balances: [{ accountId: "chk", name: "Checking", type: "depository", subtype: "checking", current: 150, available: 150, isLiquid: true }] }), NOW);
    const out = detectLowBuffer(l);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe(3);
  });
  it("does not fire with ample runway", () => {
    const l = buildLedger(inputs(), NOW); // 8000 vs 200/mo = 40 months
    expect(detectLowBuffer(l)).toHaveLength(0);
  });
});

describe("detectSavingsCapacity", () => {
  it("fires (positive) when income minus fixed/discretionary leaves a surplus", () => {
    const l = buildLedger(inputs(), NOW);
    const out = detectSavingsCapacity(l);
    expect(out).toHaveLength(1);
    expect(out[0].positive).toBe(true);
    expect(Number(out[0].headlineSlots.capacity)).toBeGreaterThan(150);
  });
});

describe("detectCategoryTrend", () => {
  it("fires when a category's latest complete month is well above baseline", () => {
    // Jan/Feb dining 100, Mar dining 300 → latest 300 vs ~100 baseline.
    const txns: LedgerTxn[] = [
      txn({ transactionId: "d1", amount: 100, date: "2026-01-15", merchant: "Chipotle" }),
      txn({ transactionId: "d2", amount: 100, date: "2026-02-15", merchant: "Chipotle" }),
      txn({ transactionId: "d3", amount: 300, date: "2026-03-15", merchant: "Chipotle" }),
      // A later (partial) month so March is the latest COMPLETE month the trend uses.
      txn({ transactionId: "d4", amount: 20, date: "2026-04-02", merchant: "Chipotle" }),
    ];
    const l = buildLedger({ txns, overrides: [], balances: [], cards: [], netWorthHistory: [] }, Date.UTC(2026, 3, 10));
    const out = detectCategoryTrend(l);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].kind).toBe("category_trend");
    expect(out[0].subject).toBe("Food & Dining");
  });
});
