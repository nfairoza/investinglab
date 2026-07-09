import { describe, it, expect } from "vitest";
import { detectConcentration } from "@/lib/insights/generators/concentration";

// F8 delta — concentration insight (observational, numbers in slots).
describe("detectConcentration", () => {
  it("fires when a single position exceeds 25% of the portfolio", () => {
    const out = detectConcentration([
      { symbol: "NVDA", value: 3100 },
      { symbol: "AAPL", value: 3000 },
      { symbol: "MSFT", value: 3900 },
    ]);
    // NVDA 3100 / 10000 = 31%.
    const nvda = out.find((i) => i.subject === "NVDA");
    // MSFT is actually the top at 39% — assert the top holding is flagged.
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe("MSFT");
    expect(out[0].headlineSlots.pct).toBe(39);
    expect(out[0].kind).toBe("concentration");
    expect(/[0-9]/.test(out[0].kind)).toBe(false); // numbers live in slots
    expect(nvda).toBeUndefined();
  });

  it("does not fire when the top position is under 25%", () => {
    const out = detectConcentration([
      { symbol: "A", value: 100 }, { symbol: "B", value: 100 }, { symbol: "C", value: 100 },
      { symbol: "D", value: 100 }, { symbol: "E", value: 100 },
    ]);
    expect(out).toHaveLength(0);
  });

  it("escalates severity at 40%+", () => {
    const out = detectConcentration([{ symbol: "TSLA", value: 500 }, { symbol: "X", value: 500 }]);
    // 50% → severity 2.
    expect(out[0].severity).toBe(2);
  });

  it("returns nothing for an empty/zero portfolio", () => {
    expect(detectConcentration([])).toHaveLength(0);
    expect(detectConcentration([{ symbol: "A", value: 0 }])).toHaveLength(0);
  });
});
