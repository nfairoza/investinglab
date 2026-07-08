import { describe, it, expect } from "vitest";
import { computePortfolioDayChange } from "@/lib/portfolio/day-change";

// Portfolio day-change aggregation must be robust to a single bad quote: a stale
// previous-close or an internally-inconsistent quote must NOT poison the headline
// number (the -6.7%-on-a-calm-day failure mode).
describe("computePortfolioDayChange", () => {
  it("sums modest moves correctly", () => {
    const r = computePortfolioDayChange([
      { symbol: "AAPL", shares: 10, price: 200, change: 2, changePct: 1.01 },   // +$20
      { symbol: "MSFT", shares: 5, price: 400, change: -4, changePct: -0.99 },  // -$20
    ]);
    expect(r.suspects).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(0, 6);
    expect(r.currentValue).toBeCloseTo(4000, 6);
  });

  it("uses absolute per-share change for the dollar move", () => {
    const r = computePortfolioDayChange([
      { symbol: "NVDA", shares: 100, price: 120, change: 3, changePct: 2.56 },
    ]);
    expect(r.suspects).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(300, 6); // 100 × $3
    expect(r.dayChangePct).toBeCloseTo((300 / (12000 - 300)) * 100, 4);
  });

  it("flags + excludes an implausible single-name move (stale previous-close)", () => {
    const r = computePortfolioDayChange([
      { symbol: "AAPL", shares: 10, price: 200, change: 2, changePct: 1.0 },     // good, +$20
      { symbol: "BAD", shares: 100, price: 50, change: -30, changePct: -60 },    // -60% → suspect
    ]);
    expect(r.suspects.map((s) => s.symbol)).toEqual(["BAD"]);
    expect(r.dayChange).toBeCloseTo(20, 6); // only AAPL counted; BAD excluded
  });

  it("flags + excludes an internally inconsistent quote", () => {
    // price×changePct implies ~ -$20/share but `change` says -$1 → disagree.
    const r = computePortfolioDayChange([
      { symbol: "STALE", shares: 10, price: 100, change: -1, changePct: -20 },
    ]);
    expect(r.suspects.map((s) => s.symbol)).toEqual(["STALE"]);
    expect(r.dayChange).toBe(0);
    expect(r.currentValue).toBe(0);
  });

  it("treats a holding with no day data as neutral (counts value, zero move)", () => {
    const r = computePortfolioDayChange([
      { symbol: "CASHY", shares: 10, price: 100, change: null, changePct: null },
    ]);
    expect(r.suspects).toHaveLength(0);
    expect(r.dayChange).toBe(0);
    expect(r.currentValue).toBe(1000);
    expect(r.prevValue).toBe(1000);
  });

  it("one bad quote cannot turn a calm day into a crash", () => {
    // 4 calm names (~0%) + 1 stale -55% quote. Without guarding, the total would
    // read like a big down day; with guarding, the stale one is excluded.
    const calm = Array.from({ length: 4 }, (_, i) => ({
      symbol: `OK${i}`, shares: 10, price: 100, change: 0.5, changePct: 0.5,
    }));
    const r = computePortfolioDayChange([
      ...calm,
      { symbol: "STALE", shares: 100, price: 100, change: -55, changePct: -55 },
    ]);
    expect(r.suspects.map((s) => s.symbol)).toEqual(["STALE"]);
    expect(r.dayChangePct!).toBeGreaterThan(0);   // calm names were slightly up
    expect(r.dayChangePct!).toBeLessThan(1);
  });
});
