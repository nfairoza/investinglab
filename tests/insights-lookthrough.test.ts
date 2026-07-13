import { describe, it, expect } from "vitest";
import { detectLookthroughConcentration } from "@/lib/insights/generators/concentration";
import type { SymbolExposure, SectorExposure } from "@/lib/lookthrough/compute";

// E3 — the concentration generator's look-through mode. Fires only when true
// (fanned-through) exposure exceeds the direct view.
describe("detectLookthroughConcentration", () => {
  const sym = (symbol: string, direct: number, viaEtfs: number, etf = "SOXL", notional = false): SymbolExposure => ({
    symbol, direct, viaEtfs, total: direct + viaEtfs, sources: viaEtfs > 0 ? [{ etf, value: viaEtfs, notional }] : [],
  });
  const sec = (sector: string, direct: number, viaEtfs: number): SectorExposure => ({ sector, direct, viaEtfs, total: direct + viaEtfs });

  it("fires a single-name insight when look-through >> direct (NVDA 19%→26%)", () => {
    const total = 100_000;
    const bySymbol = [sym("NVDA", 19_000, 7_000)]; // 19% direct, 26% look-through
    const out = detectLookthroughConcentration(bySymbol, [], total);
    const nvda = out.find((i) => i.kind === "lookthrough-concentration")!;
    expect(nvda).toBeTruthy();
    expect(nvda.headlineSlots).toMatchObject({ symbol: "NVDA", directPct: 19, ltPct: 26 });
    expect(nvda.subject).toBe("NVDA");
  });

  it("does NOT fire when the ETF adds nothing meaningful (gap < 5pp)", () => {
    const out = detectLookthroughConcentration([sym("NVDA", 28_000, 2_000)], [], 100_000); // 28% vs 30%
    expect(out.some((i) => i.kind === "lookthrough-concentration")).toBe(false);
  });

  it("does NOT fire when look-through stays under 25%", () => {
    const out = detectLookthroughConcentration([sym("NVDA", 5_000, 10_000)], [], 100_000); // 15% look-through
    expect(out.some((i) => i.kind === "lookthrough-concentration")).toBe(false);
  });

  it("labels notional (swap-leveraged) exposure in the evidence", () => {
    const out = detectLookthroughConcentration([sym("NVDA", 10_000, 20_000, "SOXL", true)], [], 100_000);
    const nvda = out.find((i) => i.kind === "lookthrough-concentration")!;
    expect(nvda.evidence[0].note).toMatch(/notional, resets daily/);
  });

  it("fires a sector insight when the sector gap is material", () => {
    const bySector = [sec("Technology", 28_000, 20_000)]; // 28% direct, 48% look-through
    const out = detectLookthroughConcentration([], bySector, 100_000);
    const tech = out.find((i) => i.kind === "lookthrough-sector")!;
    expect(tech).toBeTruthy();
    expect(tech.headlineSlots).toMatchObject({ sector: "Technology", directPct: 28, ltPct: 48 });
  });

  it("numbers live only in headlineSlots/evidence, never in kind/subject", () => {
    const out = detectLookthroughConcentration([sym("NVDA", 19_000, 7_000)], [], 100_000);
    for (const i of out) {
      expect(i.kind).not.toMatch(/\d/);
      expect(i.subject).not.toMatch(/^\d/);
    }
  });
});
