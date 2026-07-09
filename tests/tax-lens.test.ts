import { describe, it, expect } from "vitest";
import { buildTaxLens, classifyHoldingPeriod, computeTaxLot, isDecemberMode, type TaxPosition } from "@/lib/tax/lens";

const NOW = Date.UTC(2026, 11, 1); // Dec 1 2026

describe("classifyHoldingPeriod", () => {
  it("returns unknown when no acquisition date", () => {
    expect(classifyHoldingPeriod(null, NOW).period).toBe("unknown");
  });
  it("classifies > 1 year as long-term", () => {
    expect(classifyHoldingPeriod("2024-01-01", NOW).period).toBe("long");
  });
  it("classifies < 1 year as short-term", () => {
    expect(classifyHoldingPeriod("2026-09-01", NOW).period).toBe("short");
  });
});

describe("computeTaxLot", () => {
  it("computes unrealized gain and holding period", () => {
    const p: TaxPosition = { symbol: "AAPL", shares: 10, avgCost: 100, price: 150, acquiredDate: "2024-01-01" };
    const lot = computeTaxLot(p, NOW);
    expect(lot.costBasis).toBe(1000);
    expect(lot.marketValue).toBe(1500);
    expect(lot.unrealized).toBe(500);
    expect(lot.holdingPeriod).toBe("long");
  });
  it("flags a short-term lot crossing into long-term within 60 days", () => {
    // Acquired ~340 days ago → ~26 days to the 1-year line.
    const acquired = new Date(NOW - 340 * 86_400_000).toISOString().slice(0, 10);
    const lot = computeTaxLot({ symbol: "X", shares: 1, avgCost: 10, price: 12, acquiredDate: acquired }, NOW);
    expect(lot.holdingPeriod).toBe("short");
    expect(lot.crossesLongTermInDays).toBeLessThanOrEqual(60);
  });
});

describe("buildTaxLens", () => {
  it("splits ST/LT only where known and counts unknowns; finds harvest candidates", () => {
    const positions: TaxPosition[] = [
      { symbol: "WIN_LT", shares: 10, avgCost: 100, price: 150, acquiredDate: "2024-01-01" }, // +500 long
      { symbol: "LOSS_UNK", shares: 5, avgCost: 200, price: 150, acquiredDate: null },        // -250 unknown period
    ];
    const lens = buildTaxLens(positions, NOW);
    expect(lens.longTermUnrealized).toBe(500);
    expect(lens.shortTermUnrealized).toBe(0);
    expect(lens.unknownPeriodCount).toBe(1);
    expect(lens.totalUnrealized).toBe(250); // 500 - 250
    expect(lens.harvestCandidates.map((h) => h.symbol)).toContain("LOSS_UNK");
  });
});

describe("isDecemberMode", () => {
  it("is true Nov 15 – Dec 31, false otherwise", () => {
    expect(isDecemberMode(Date.UTC(2026, 11, 1))).toBe(true);   // Dec 1
    expect(isDecemberMode(Date.UTC(2026, 10, 20))).toBe(true);  // Nov 20
    expect(isDecemberMode(Date.UTC(2026, 10, 1))).toBe(false);  // Nov 1
    expect(isDecemberMode(Date.UTC(2026, 5, 1))).toBe(false);   // June
  });
});
