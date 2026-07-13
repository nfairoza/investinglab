import { describe, it, expect } from "vitest";
import { parseFairValueRange, deriveVerdict } from "@/lib/watchlist/verdict";

describe("parseFairValueRange", () => {
  it("parses en-dash currency ranges", () => {
    expect(parseFairValueRange("$180–$210")).toEqual({ low: 180, high: 210 });
  });
  it("parses hyphen and 'to' ranges, and orders low<high", () => {
    expect(parseFairValueRange("210 - 180")).toEqual({ low: 180, high: 210 });
    expect(parseFairValueRange("$1,800 to $2,100")).toEqual({ low: 1800, high: 2100 });
  });
  it("returns null when it can't find two distinct numbers", () => {
    expect(parseFairValueRange("around $200")).toBeNull();
    expect(parseFairValueRange("$200–$200")).toBeNull();
    expect(parseFairValueRange(undefined)).toBeNull();
  });
});

describe("deriveVerdict — price-sensitive, never cached", () => {
  const analysis = { idealBuy: 180, fairValue: "$190–$220", aiAction: "Wait" };

  it("Buy now at or below the ideal entry", () => {
    const v = deriveVerdict(analysis, 175);
    expect(v.action).toBe("Buy now");
    expect(v.atOrBelowIdeal).toBe(true);
  });

  it("Avoid when the live price is above fair value", () => {
    const v = deriveVerdict(analysis, 240);
    expect(v.action).toBe("Avoid");
    expect(v.vsFairValue).toBe("above");
  });

  it("Start small when below the fair-value range but above ideal", () => {
    const v = deriveVerdict(analysis, 185); // below low(190), above ideal(180)
    expect(v.action).toBe("Start small");
    expect(v.vsFairValue).toBe("below");
  });

  it("Wait when inside the fair-value range", () => {
    const v = deriveVerdict(analysis, 205);
    expect(v.action).toBe("Wait");
    expect(v.vsFairValue).toBe("within");
  });

  it("THE KEY GUARANTEE: the same cached analysis yields opposite verdicts at different live prices", () => {
    const cheap = deriveVerdict(analysis, 170);
    const rich = deriveVerdict(analysis, 260);
    expect(cheap.action).toBe("Buy now");
    expect(rich.action).toBe("Avoid");
    // "below your ideal entry" must be true only against the actual current price.
    expect(cheap.atOrBelowIdeal).toBe(true);
    expect(rich.atOrBelowIdeal).toBe(false);
  });

  it("no live price → honest non-verdict, not a stale claim", () => {
    const v = deriveVerdict(analysis, null);
    expect(v.atOrBelowIdeal).toBeNull();
    expect(v.vsFairValue).toBeNull();
    expect(v.line).toMatch(/unavailable/i);
  });

  it("with no ideal buy, still verdicts from the fair-value range alone", () => {
    const v = deriveVerdict({ fairValue: "$100–$120" }, 90);
    expect(v.action).toBe("Start small");
    expect(v.atOrBelowIdeal).toBeNull();
  });
});
