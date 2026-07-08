import { describe, it, expect } from "vitest";
import {
  classifyDayChange,
  resolveDayChangeSync,
  resolveDayChange,
  verifyAgainstHistory,
} from "@/lib/portfolio/day-change";

// Portfolio day-change aggregation must be robust to a single bad quote: a stale
// previous-close or an internally-inconsistent quote must NOT poison the headline
// number (the -6.7%-on-a-calm-day failure mode). But a REAL large move (earnings
// crash) confirmed by an independent source must be kept.
describe("classifyDayChange", () => {
  it("sums modest moves correctly", () => {
    const r = resolveDayChangeSync([
      { symbol: "AAPL", shares: 10, price: 200, change: 2, changePct: 1.01 },   // +$20
      { symbol: "MSFT", shares: 5, price: 400, change: -4, changePct: -0.99 },  // -$20
    ], {});
    expect(r.excluded).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(0, 6);
    expect(r.currentValue).toBeCloseTo(4000, 6);
  });

  it("uses absolute per-share change for the dollar move", () => {
    const r = resolveDayChangeSync([
      { symbol: "NVDA", shares: 100, price: 120, change: 3, changePct: 2.56 },
    ], {});
    expect(r.excluded).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(300, 6); // 100 × $3
  });

  it("excludes an internally inconsistent quote immediately (no verification)", () => {
    // price×changePct implies ~ -$20/share but `change` says -$1 → disagree.
    const c = classifyDayChange([
      { symbol: "STALE", shares: 10, price: 100, change: -1, changePct: -20 },
    ]);
    expect(c.excluded.map((s) => s.symbol)).toEqual(["STALE"]);
    expect(c.excluded[0].kind).toBe("inconsistent");
    expect(c.pending).toHaveLength(0);
  });

  it("a big but consistent move is PENDING, not excluded outright", () => {
    const c = classifyDayChange([
      { symbol: "CRASH", shares: 10, price: 50, change: -50, changePct: -50 },
    ]);
    expect(c.excluded).toHaveLength(0);
    expect(c.pending.map((s) => s.symbol)).toEqual(["CRASH"]);
    expect(c.pending[0].kind).toBe("magnitude");
  });
});

describe("verifyAgainstHistory", () => {
  it("confirms a move that matches a recent daily close", () => {
    // price 50, claimed -50% → prev ~100. History has 100 as a recent close.
    expect(verifyAgainstHistory(50, -50, [110, 100])).toBe(true);
  });
  it("rejects a move history does not corroborate", () => {
    // price 50, claimed -50% → prev ~100, but history says it closed ~52 (flat).
    expect(verifyAgainstHistory(50, -50, [53, 52])).toBe(false);
  });
  it("rejects when there is no history", () => {
    expect(verifyAgainstHistory(50, -50, [])).toBe(false);
  });
});

describe("resolveDayChangeSync — magnitude verification", () => {
  it("INCLUDES a legitimate -50% earnings crash confirmed by history", () => {
    const r = resolveDayChangeSync(
      [{ symbol: "CRASH", shares: 10, price: 50, change: -50, changePct: -50 }],
      { CRASH: [110, 100] }, // prev close ~100 corroborates the -50% move
    );
    expect(r.excluded).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(-500, 6); // 10 × -$50, kept
    expect(r.currentValue).toBeCloseTo(500, 6);
  });

  it("EXCLUDES the same move when history contradicts it (marker shown)", () => {
    const r = resolveDayChangeSync(
      [{ symbol: "BADQUOTE", shares: 10, price: 50, change: -50, changePct: -50 }],
      { BADQUOTE: [51, 50] }, // history says it's been ~flat → the -50% is bogus
    );
    expect(r.excluded.map((s) => s.symbol)).toEqual(["BADQUOTE"]);
    expect(r.excluded[0].kind).toBe("contradicted");
    expect(r.dayChange).toBe(0); // excluded, not silently summed
  });

  it("marks a magnitude suspect 'unverified' when no history is available", () => {
    const r = resolveDayChangeSync(
      [{ symbol: "NOHIST", shares: 10, price: 50, change: -50, changePct: -50 }],
      {}, // no closes for this symbol
    );
    expect(r.excluded[0].kind).toBe("unverified");
    expect(r.dayChange).toBe(0);
  });

  it("one bad quote cannot turn a calm day into a crash", () => {
    // OK names: price 100, prevClose ~99.5 → change +0.5, +0.5% (internally consistent).
    const calm = Array.from({ length: 4 }, (_, i) => ({
      symbol: `OK${i}`, shares: 10, price: 100, change: 0.5, changePct: 0.503,
    }));
    // STALE: a -50% move that IS internally consistent (price 50, prevClose 100),
    // but history says it's been ~flat near 50 → contradicted, excluded.
    const r = resolveDayChangeSync(
      [...calm, { symbol: "STALE", shares: 100, price: 50, change: -50, changePct: -50 }],
      { STALE: [51, 50] },
    );
    expect(r.excluded.map((s) => s.symbol)).toEqual(["STALE"]);
    expect(r.dayChangePct!).toBeGreaterThan(0);
    expect(r.dayChangePct!).toBeLessThan(1);
  });
});

describe("resolveDayChange — async fetch variant", () => {
  it("verifies pending suspects via injected fetchCloses", async () => {
    const r = await resolveDayChange(
      [{ symbol: "CRASH", shares: 10, price: 50, change: -50, changePct: -50 }],
      async (sym) => (sym === "CRASH" ? [110, 100] : []),
    );
    expect(r.excluded).toHaveLength(0);
    expect(r.dayChange).toBeCloseTo(-500, 6);
  });
});
