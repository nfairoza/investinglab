import { describe, it, expect } from "vitest";
import { dcfVerdict, DCF_DIVERGENCE_LIMIT } from "@/lib/valuation/dcf-verdict";

describe("dcfVerdict polarity", () => {
  it("price ABOVE dcf → overvalued, never green (VRT case)", () => {
    // Real regression: dcf 18.53, price 304.57. Old code painted this green.
    const v = dcfVerdict(18.53, 304.57)!;
    expect(v.direction).toBe("above");
    expect(v.overvalued).toBe(true);
    expect(v.undervalued).toBe(false);
    // With a 1543% divergence, the sanity gate fires — no confident label.
    expect(v.unreliable).toBe(true);
    expect(v.label).toBe("");
  });

  it("price ABOVE dcf within sane range → 'above… overvalued'", () => {
    // price 120, dcf 100 → +20% above, 16.7% divergence (under the gate).
    const v = dcfVerdict(100, 120)!;
    expect(v.direction).toBe("above");
    expect(v.overvalued).toBe(true);
    expect(v.pctFromFair).toBeCloseTo(20, 5);
    expect(v.unreliable).toBe(false);
    expect(v.label).toBe("20.0% above fair value (potentially overvalued)");
  });

  it("price BELOW dcf → 'below… undervalued', green", () => {
    // price 80, dcf 100 → −20% below, 25% divergence (under the gate).
    const v = dcfVerdict(100, 80)!;
    expect(v.direction).toBe("below");
    expect(v.undervalued).toBe(true);
    expect(v.overvalued).toBe(false);
    expect(v.pctFromFair).toBeCloseTo(-20, 5);
    expect(v.unreliable).toBe(false);
    expect(v.label).toBe("20.0% below fair value (potentially undervalued)");
  });

  it("percentage is always (price − dcf)/dcf", () => {
    expect(dcfVerdict(50, 75)!.pctFromFair).toBeCloseTo(50, 5); // 75 is 50% above 50
    expect(dcfVerdict(200, 150)!.pctFromFair).toBeCloseTo(-25, 5); // 150 is 25% below 200
  });
});

describe("dcfVerdict sanity gate", () => {
  it("fires when |price − dcf| / price > 60%", () => {
    // dcf 30, price 100 → 70% divergence → unreliable, no verdict label.
    const v = dcfVerdict(30, 100)!;
    expect(v.divergencePct).toBeCloseTo(70, 5);
    expect(v.unreliable).toBe(true);
    expect(v.label).toBe("");
  });

  it("does NOT fire at exactly the limit boundary", () => {
    // Construct divergence == limit: |p − d|/p = 0.60 → d = 0.40 * p.
    const price = 100, dcf = 40;
    const v = dcfVerdict(dcf, price)!;
    expect(v.divergencePct).toBeCloseTo(DCF_DIVERGENCE_LIMIT, 5);
    expect(v.unreliable).toBe(false); // strictly greater-than triggers it
    expect(v.label).toContain("above fair value");
  });

  it("fires for an extreme undervalued reading too (both directions)", () => {
    // dcf 500, price 100 → price 80% below fair value → 400% from fair, but
    // the gate metric |p−d|/p = 400% → unreliable, no green badge.
    const v = dcfVerdict(500, 100)!;
    expect(v.undervalued).toBe(true);
    expect(v.unreliable).toBe(true);
    expect(v.label).toBe("");
  });
});

describe("dcfVerdict guards", () => {
  it("returns null on missing or non-positive inputs", () => {
    expect(dcfVerdict(null, 100)).toBeNull();
    expect(dcfVerdict(100, null)).toBeNull();
    expect(dcfVerdict(0, 100)).toBeNull();
    expect(dcfVerdict(100, -5)).toBeNull();
    expect(dcfVerdict(undefined, undefined)).toBeNull();
  });

  it("equal price and dcf → 'at fair value', no color", () => {
    const v = dcfVerdict(100, 100)!;
    expect(v.direction).toBe("equal");
    expect(v.overvalued).toBe(false);
    expect(v.undervalued).toBe(false);
    expect(v.label).toBe("at fair value");
  });
});
