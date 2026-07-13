import { describe, it, expect } from "vitest";
import {
  median, roundSuggestion, suggestTargets, targetProgress, monthElapsedFraction, monthResult,
  type MonthlyCategorySpend,
} from "@/lib/money/targets";

describe("median / roundSuggestion", () => {
  it("computes p50 for odd and even counts", () => {
    expect(median([400, 410, 450])).toBe(410);
    expect(median([400, 420])).toBe(410);
    expect(median([])).toBe(0);
  });
  it("rounds to friendly increments ($25 under 500, $50 above)", () => {
    expect(roundSuggestion(410)).toBe(400);
    expect(roundSuggestion(415)).toBe(425);
    expect(roundSuggestion(760)).toBe(750);
  });
});

describe("suggestTargets", () => {
  const history: MonthlyCategorySpend[] = [
    { month: "2026-04", category: "Dining", total: 400 },
    { month: "2026-05", category: "Dining", total: 410 },
    { month: "2026-06", category: "Dining", total: 450 },
    { month: "2026-04", category: "Groceries", total: 600 },
    { month: "2026-05", category: "Groceries", total: 620 },
    { month: "2026-06", category: "Groceries", total: 610 },
    { month: "2026-06", category: "OneOff", total: 90 }, // only 1 month → skipped
  ];

  it("suggests from p50 of the trailing 3 months, rounded, most-spent first", () => {
    const s = suggestTargets(history, { months: 3, minMonths: 2 });
    expect(s.map((x) => x.category)).toEqual(["Groceries", "Dining"]);
    const dining = s.find((x) => x.category === "Dining")!;
    expect(dining.p50).toBe(410);
    expect(dining.suggested).toBe(400);
    expect(dining.monthsUsed).toBe(3);
  });

  it("skips categories with fewer than minMonths of data", () => {
    const s = suggestTargets(history, { months: 3, minMonths: 2 });
    expect(s.find((x) => x.category === "OneOff")).toBeUndefined();
  });

  it("only uses the most recent N months", () => {
    const long: MonthlyCategorySpend[] = [
      { month: "2026-01", category: "Dining", total: 1000 }, // old blowout, excluded by months:3
      { month: "2026-04", category: "Dining", total: 400 },
      { month: "2026-05", category: "Dining", total: 410 },
      { month: "2026-06", category: "Dining", total: 450 },
    ];
    const s = suggestTargets(long, { months: 3, minMonths: 2 });
    expect(s[0].p50).toBe(410); // the old 1000 didn't inflate it
  });
});

describe("monthElapsedFraction / targetProgress", () => {
  it("fraction of month elapsed", () => {
    expect(monthElapsedFraction(15, 30)).toBe(0.5);
    expect(monthElapsedFraction(30, 30)).toBe(1);
  });

  it("flags 'ahead' (overspending) when past the expected line", () => {
    // target 400, day 15/30 → expected 200. Spent 300 → ahead of pace.
    const p = targetProgress("Dining", 400, 300, 15, 30);
    expect(p.expectedByNow).toBe(200);
    expect(p.pace).toBe("ahead");
    expect(p.projected).toBe(600); // 300 / 0.5
    expect(p.ratio).toBeCloseTo(0.75, 5);
  });

  it("flags 'behind' (underspending, good) when below the expected line", () => {
    const p = targetProgress("Dining", 400, 80, 15, 30);
    expect(p.pace).toBe("behind");
  });

  it("flags 'on' pace within the tolerance band", () => {
    const p = targetProgress("Dining", 400, 205, 15, 30); // expected 200, within 5%
    expect(p.pace).toBe("on");
  });
});

describe("monthResult", () => {
  it("reports under/over target honestly", () => {
    expect(monthResult("Dining", 375, 329)).toEqual({ category: "Dining", target: 375, spent: 329, delta: 46, under: true });
    expect(monthResult("Dining", 375, 420).under).toBe(false);
  });
});
