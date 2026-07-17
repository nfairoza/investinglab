import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the delivery pipeline so we can assert dedupeKeys + call counts without a DB.
const recorded: any[] = [];
vi.mock("@/lib/alerts/delivery", () => ({
  recordDelivery: vi.fn(async (_db: any, input: any) => { recorded.push(input); return { deliveryId: "d", push: "ok", email: "n/a" }; }),
}));

import { crossedThresholds, evaluateBudgetThresholds } from "@/lib/money/budget-alerts";
import { suggestTargets, targetProgress } from "@/lib/money/targets";
import type { Ledger, LedgerMonth } from "@/lib/insights/types";

function month(m: string, byCategory: Record<string, number>): LedgerMonth {
  const spend = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return { month: m, income: 5000, fixed: 0, discretionary: spend, savingsFlow: 5000 - spend, byCategory };
}
function ledger(months: LedgerMonth[]): Ledger {
  return { months, flags: [], incomeStreams: [], cards: [], balances: [], netWorthHistory: [], asOf: "2026-07-17T12:00:00Z", monthsOfData: months.length };
}

// Fake supabase whose chained .select().eq().eq().eq() awaits to { data: rows }.
function fakeBudgetsDb(rows: any[]) {
  const result = { data: rows };
  const chain: any = { eq: () => chain, then: (r: any) => r(result) };
  chain.eq = () => chain;
  return { from: () => ({ select: () => chain }) } as any;
}

describe("crossedThresholds", () => {
  it("returns nothing below 80%", () => {
    expect(crossedThresholds(79, 100)).toEqual([]);
  });
  it("returns [80] at 80–99%", () => {
    expect(crossedThresholds(80, 100)).toEqual([80]);
    expect(crossedThresholds(99, 100)).toEqual([80]);
  });
  it("returns [80,100] at/over 100%", () => {
    expect(crossedThresholds(100, 100)).toEqual([80, 100]);
    expect(crossedThresholds(146, 100)).toEqual([80, 100]);
  });
  it("guards a zero/negative budget", () => {
    expect(crossedThresholds(50, 0)).toEqual([]);
  });
});

describe("evaluateBudgetThresholds", () => {
  beforeEach(() => { recorded.length = 0; });

  it("fires 80 + 100 for an exceeded budget with distinct dedupeKeys once each", async () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    const l = ledger([month("2026-07", { "Food & Dining": 460 })]); // budget 400 → 115%
    const db = fakeBudgetsDb([{ id: "b1", category: "Food & Dining", monthly_amount: 400 }]);
    const { delivered } = await evaluateBudgetThresholds(db, "u1", l, now);
    expect(delivered).toBe(2);
    const keys = recorded.map((r) => r.dedupeKey).sort();
    expect(keys).toEqual(["budget:b1:100:2026-07", "budget:b1:80:2026-07"]);
    // Every delivery is severity 1, kind budget, deep-links the budgets tab.
    for (const r of recorded) { expect(r.severity).toBe(1); expect(r.kind).toBe("budget"); expect(r.url).toBe("/money/budgets"); }
  });

  it("fires only 80 for an approaching (not exceeded) budget", async () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    const l = ledger([month("2026-07", { Groceries: 340 })]); // budget 400 → 85%
    const db = fakeBudgetsDb([{ id: "b2", category: "Groceries", monthly_amount: 400 }]);
    await evaluateBudgetThresholds(db, "u1", l, now);
    expect(recorded.map((r) => r.dedupeKey)).toEqual(["budget:b2:80:2026-07"]);
  });

  it("fires nothing under 80%", async () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    const l = ledger([month("2026-07", { Shopping: 100 })]); // budget 400 → 25%
    const db = fakeBudgetsDb([{ id: "b3", category: "Shopping", monthly_amount: 400 }]);
    const { delivered } = await evaluateBudgetThresholds(db, "u1", l, now);
    expect(delivered).toBe(0);
  });
});

// The budgets path reuses the MV2 math verbatim — a smoke check that suggestion
// + pace still behave as budgets expect.
describe("budgets reuse of targets math", () => {
  it("suggests p50 of trailing 3 months", () => {
    const history = [
      { month: "2026-04", category: "Food & Dining", total: 300 },
      { month: "2026-05", category: "Food & Dining", total: 400 },
      { month: "2026-06", category: "Food & Dining", total: 500 },
    ];
    const [s] = suggestTargets(history, { months: 3, minMonths: 2 });
    expect(s.category).toBe("Food & Dining");
    expect(s.p50).toBe(400); // median of 300/400/500
  });

  it("pace math flags overspending at mid-month", () => {
    // $300 spent by day 10 of 30 against a $400 budget → projected ~900 → ahead.
    const p = targetProgress("Food & Dining", 400, 300, 10, 30);
    expect(p.pace).toBe("ahead");
    expect(p.projected).toBeGreaterThan(400);
  });
});
