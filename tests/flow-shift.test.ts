import { describe, it, expect } from "vitest";
import { detectFlowShift } from "@/lib/insights/generators/flow-shift";
import type { Ledger, LedgerMonth } from "@/lib/insights/types";

const NOW = new Date("2026-07-15T12:00:00Z");

function month(m: string, income: number, byCategory: Record<string, number>): LedgerMonth {
  const spend = Object.values(byCategory).reduce((s, v) => s + v, 0);
  return { month: m, income, fixed: 0, discretionary: spend, savingsFlow: income - spend, byCategory };
}
function ledger(months: LedgerMonth[]): Ledger {
  return { months, flags: [], incomeStreams: [], cards: [], balances: [], netWorthHistory: [], asOf: NOW.toISOString(), monthsOfData: months.length };
}

describe("detectFlowShift", () => {
  it("fires when a category's share of income jumps materially vs the 3-month mix", () => {
    const l = ledger([
      month("2026-04", 5000, { "Food & Dining": 450 }), // 9%
      month("2026-05", 5000, { "Food & Dining": 450 }), // 9%
      month("2026-06", 5000, { "Food & Dining": 450 }), // 9%
      month("2026-07", 5000, { "Food & Dining": 650 }), // 13%
    ]);
    const out = detectFlowShift(l, NOW);
    const fd = out.find((i) => i.subject === "Food & Dining");
    expect(fd).toBeTruthy();
    expect(fd!.headlineSlots.thisPct).toBe(13);
    expect(fd!.headlineSlots.usualPct).toBe(9);
    expect(fd!.positive).toBe(false); // bigger slice = not positive
  });

  it("does NOT fire on a small (<3pt) shift", () => {
    const l = ledger([
      month("2026-05", 5000, { Shopping: 500 }), // 10%
      month("2026-06", 5000, { Shopping: 500 }), // 10%
      month("2026-07", 5000, { Shopping: 560 }), // 11.2% → ~1pt
    ]);
    expect(detectFlowShift(l, NOW).find((i) => i.subject === "Shopping")).toBeUndefined();
  });

  it("marks a shrinking share as positive", () => {
    const l = ledger([
      month("2026-04", 5000, { Shopping: 750 }), // 15%
      month("2026-05", 5000, { Shopping: 750 }), // 15%
      month("2026-06", 5000, { Shopping: 750 }), // 15%
      month("2026-07", 5000, { Shopping: 450 }), // 9%
    ]);
    const out = detectFlowShift(l, NOW);
    const s = out.find((i) => i.subject === "Shopping")!;
    expect(s.positive).toBe(true);
  });

  it("returns nothing with ZERO prior months (nothing to compare against)", () => {
    const l = ledger([month("2026-07", 5000, { "Food & Dining": 900 })]);
    expect(detectFlowShift(l, NOW)).toEqual([]);
  });

  it("Q7: fires with only ONE prior month, carrying a limited-history qualifier", () => {
    const l = ledger([
      month("2026-06", 5000, { "Food & Dining": 450 }), // 9% — sole baseline month
      month("2026-07", 5000, { "Food & Dining": 700 }), // 14%
    ]);
    const fd = detectFlowShift(l, NOW).find((i) => i.subject === "Food & Dining");
    expect(fd).toBeTruthy();
    expect(fd!.headlineSlots.limitedHistory).toBe(1);
    expect(fd!.severity).toBe(1); // capped on limited history
    // Evidence states the actual baseline window, not a fixed "3-month".
    expect(fd!.evidence[0].note).toMatch(/prior 1 month \(limited history so far\)/);
  });

  it("Q7: full 3-month baseline has NO limited-history qualifier", () => {
    const l = ledger([
      month("2026-04", 5000, { "Food & Dining": 450 }),
      month("2026-05", 5000, { "Food & Dining": 450 }),
      month("2026-06", 5000, { "Food & Dining": 450 }),
      month("2026-07", 5000, { "Food & Dining": 650 }),
    ]);
    const fd = detectFlowShift(l, NOW).find((i) => i.subject === "Food & Dining")!;
    expect(fd.headlineSlots.limitedHistory).toBeUndefined();
    expect(fd.evidence[0].note).toMatch(/prior 3 months\./);
  });
});
