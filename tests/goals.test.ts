import { describe, it, expect } from "vitest";
import { projectGoal, trailingFundingRate } from "@/lib/money/goals";

describe("trailingFundingRate", () => {
  it("averages the last N months, floored at 0", () => {
    expect(trailingFundingRate([100, 200, 300], 3)).toBe(200);
    expect(trailingFundingRate([500, 200, 300, 400], 3)).toBe(300); // last 3
    expect(trailingFundingRate([-100, -50, 0], 3)).toBe(0); // floored
    expect(trailingFundingRate([], 3)).toBe(0);
  });
});

describe("projectGoal — steady funding", () => {
  it("projects completion from the funding rate", () => {
    // remaining 3600, funding 300/mo → 12 months.
    const p = projectGoal({ targetAmount: 5000, currentAmount: 1400, monthlyFunding: 300, targetDate: null, now: "2026-07-01" });
    expect(p.remaining).toBe(3600);
    expect(p.monthsToGoal).toBe(12);
    expect(p.projectedDate).toBe("2027-07-01");
    expect(p.onTrack).toBeNull(); // no target date
  });

  it("flags 'late' + the +$X/mo lever vs a target date", () => {
    // remaining 3600, funding 300 → 12mo (Jul 2027). Target Apr 2027 (9mo away).
    // required = 3600/9 = 400/mo, extra needed 100/mo.
    const p = projectGoal({ targetAmount: 5000, currentAmount: 1400, monthlyFunding: 300, targetDate: "2027-04-01", now: "2026-07-01" });
    expect(p.requiredMonthly).toBe(400);
    expect(p.extraNeeded).toBe(100);
    expect(p.onTrack).toBe(false);
    expect(p.monthsEarlyOrLate).toBe(3); // ~3 months late
  });

  it("reports 'ahead' (negative months, no extra needed) when funding beats the date", () => {
    // remaining 1200, funding 300 → 4mo (Nov 2026). Target Feb 2027 (7mo away).
    const p = projectGoal({ targetAmount: 2000, currentAmount: 800, monthlyFunding: 300, targetDate: "2027-02-01", now: "2026-07-01" });
    expect(p.onTrack).toBe(true);
    expect(p.monthsEarlyOrLate).toBeLessThan(0); // early
    expect(p.extraNeeded).toBe(0);
  });
});

describe("projectGoal — declining / zero funding", () => {
  it("returns null projection when funding is zero", () => {
    const p = projectGoal({ targetAmount: 5000, currentAmount: 1000, monthlyFunding: 0, targetDate: "2027-01-01", now: "2026-07-01" });
    expect(p.monthsToGoal).toBeNull();
    expect(p.projectedDate).toBeNull();
    expect(p.onTrack).toBe(false);
    // still tells the user what they'd need per month.
    expect(p.requiredMonthly).toBeGreaterThan(0);
  });

  it("marks an already-funded goal achieved", () => {
    const p = projectGoal({ targetAmount: 1000, currentAmount: 1200, monthlyFunding: 100, targetDate: "2027-01-01", now: "2026-07-01" });
    expect(p.achieved).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.monthsToGoal).toBe(0);
    expect(p.onTrack).toBe(true);
  });
});

describe("projectGoal — contribution-only (investment-linked)", () => {
  it("projects on contributions with no market assumption (same math, caller notes it)", () => {
    // The projection is identical; the "excludes market movement" note is the
    // caller's — this asserts we never inflate funding with a return.
    const p = projectGoal({ targetAmount: 12000, currentAmount: 0, monthlyFunding: 1000, targetDate: null, now: "2026-01-01" });
    expect(p.monthsToGoal).toBe(12);
    expect(p.projectedDate).toBe("2027-01-01");
  });
});
