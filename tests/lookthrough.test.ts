import { describe, it, expect } from "vitest";
import { computeLookthrough, pctOf, type HoldingValue, type EtfExposure } from "@/lib/lookthrough/compute";

describe("computeLookthrough", () => {
  // Fixture: $10k NVDA direct + $10k SOXL (3x semis, notional). SOXL's index is
  // NVDA 25% / AVGO 20% / AMD 15% (rest omitted for the test).
  const holdings: HoldingValue[] = [
    { symbol: "NVDA", value: 10_000, isEtf: false },
    { symbol: "SOXL", value: 10_000, isEtf: true },
  ];
  const etfs: EtfExposure[] = [
    {
      symbol: "SOXL",
      value: 10_000,
      leverageFactor: 3,
      notional: true,
      constituents: [
        { symbol: "NVDA", weight: 25, sector: "Technology" },
        { symbol: "AVGO", weight: 20, sector: "Technology" },
        { symbol: "AMD", weight: 15, sector: "Technology" },
      ],
    },
  ];
  const sectors = { NVDA: "Technology", SOXL: "Technology" };

  it("adds ETF exposure on top of direct (NVDA look-through > direct)", () => {
    const r = computeLookthrough(holdings, etfs, sectors);
    const nvda = r.bySymbol.find((s) => s.symbol === "NVDA")!;
    // Direct 10k + SOXL(10k × 25% × 3) = 10k + 7.5k = 17.5k
    expect(nvda.direct).toBe(10_000);
    expect(nvda.viaEtfs).toBeCloseTo(7_500, 0);
    expect(nvda.total).toBeCloseTo(17_500, 0);
    // Evidence records the ETF source + notional flag.
    expect(nvda.sources[0]).toMatchObject({ etf: "SOXL", notional: true });
  });

  it("surfaces AVGO/AMD that were NOT directly held", () => {
    const r = computeLookthrough(holdings, etfs, sectors);
    const avgo = r.bySymbol.find((s) => s.symbol === "AVGO")!;
    const amd = r.bySymbol.find((s) => s.symbol === "AMD")!;
    expect(avgo.direct).toBe(0);
    expect(avgo.viaEtfs).toBeCloseTo(6_000, 0); // 10k × 20% × 3
    expect(amd.viaEtfs).toBeCloseTo(4_500, 0);  // 10k × 15% × 3
  });

  it("look-through semiconductor/tech sector exceeds the direct view", () => {
    const r = computeLookthrough(holdings, etfs, sectors);
    const tech = r.bySector.find((s) => s.sector === "Technology")!;
    // Direct tech = NVDA 10k only (SOXL fans out, not counted directly).
    expect(tech.direct).toBe(10_000);
    // Via ETFs = 10k × (25+20+15)% × 3 = 10k × 0.6 × 3 = 18k
    expect(tech.viaEtfs).toBeCloseTo(18_000, 0);
    expect(tech.total).toBeGreaterThan(tech.direct);
  });

  it("applies leverage factor only to leveraged funds", () => {
    const plain: EtfExposure[] = [{
      symbol: "SOXL", value: 10_000, leverageFactor: 1, notional: false,
      constituents: [{ symbol: "NVDA", weight: 25 }],
    }];
    const r = computeLookthrough(holdings, plain);
    const nvda = r.bySymbol.find((s) => s.symbol === "NVDA")!;
    expect(nvda.viaEtfs).toBeCloseTo(2_500, 0); // 10k × 25% × 1
  });

  it("pctOf guards divide-by-zero", () => {
    expect(pctOf(50, 200)).toBe(25);
    expect(pctOf(50, 0)).toBe(0);
  });
});
