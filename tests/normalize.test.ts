import { describe, it, expect } from "vitest";
import { normalizeToOpen, lastPct } from "@/lib/portfolio/normalize";

// 1D charts normalize both the portfolio and the SPY benchmark to 0% at today's
// open so the two lines are directly comparable on one axis.
describe("normalizeToOpen", () => {
  it("first point is always 0%", () => {
    const out = normalizeToOpen([{ v: 1000, date: "09:30" }, { v: 1010, date: "10:00" }]);
    expect(out[0].pct).toBe(0);
  });

  it("computes percent change from the open", () => {
    const out = normalizeToOpen([
      { v: 1000, date: "09:30" },
      { v: 1050, date: "12:00" }, // +5%
      { v: 990, date: "16:00" },  // -1%
    ]);
    expect(out[1].pct).toBeCloseTo(5, 6);
    expect(out[2].pct).toBeCloseTo(-1, 6);
    expect(lastPct(out)).toBeCloseTo(-1, 6);
  });

  it("empty series → empty", () => {
    expect(normalizeToOpen([])).toEqual([]);
    expect(lastPct([])).toBeNull();
  });

  it("portfolio and benchmark share the 0%-at-open baseline", () => {
    const port = normalizeToOpen([{ v: 24000, date: "09:30" }, { v: 24240, date: "16:00" }]); // +1%
    const spy = normalizeToOpen([{ v: 500, date: "09:30" }, { v: 502.5, date: "16:00" }]);    // +0.5%
    expect(lastPct(port)).toBeCloseTo(1, 6);
    expect(lastPct(spy)).toBeCloseTo(0.5, 6);
    expect(port[0].pct).toBe(spy[0].pct); // both start at 0
  });
});
