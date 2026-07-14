import { describe, it, expect } from "vitest";
import { detectIdleCash, detectArbitrage } from "@/lib/insights/generators";
import type { Ledger } from "@/lib/insights/types";

// A minimal ledger with idle cash + a high-APR card, enough to fire both
// generators. We only need the fields the facts read (balances + cards).
function ledgerWith(liquid: number, cardBalance: number, apr: number): Ledger {
  return {
    months: [], flags: [], incomeStreams: [],
    balances: [{ accountId: "chk", name: "Checking", type: "depository", subtype: "checking", current: liquid, available: liquid, isLiquid: true }],
    cards: [{ accountId: "cc", name: "Visa", balance: cardBalance, limit: 10000, apr }],
    netWorthHistory: [], asOf: "2026-07-14T00:00:00Z", monthsOfData: 6,
  };
}

const RATE = { ratePct: 4.3, asOf: "2026-07-13" };

describe("MV4 idle-cash grounding", () => {
  it("populates impactPerYear + rate slots (with asOf) when a rate is passed", () => {
    const out = detectIdleCash(ledgerWith(20000, 0, 0), RATE);
    expect(out.length).toBe(1);
    const i = out[0];
    // idle ≈ liquid − buffer; annual = idle × 4.3%.
    expect(i.impactPerYear).not.toBeNull();
    expect(i.headlineSlots.ratePct).toBe(4.3);
    expect(i.headlineSlots.rateAsOf).toBe("2026-07-13");
    expect(i.factsUsed).toContain("rates.v1");
    expect(Number(i.headlineSlots.annualIfMoved)).toBeGreaterThan(0);
  });

  it("degrades to the previous framing (impactPerYear null, no rate slots) without a rate", () => {
    const out = detectIdleCash(ledgerWith(20000, 0, 0), null);
    expect(out.length).toBe(1);
    expect(out[0].impactPerYear).toBeNull();
    expect(out[0].headlineSlots.ratePct).toBeUndefined();
    expect(out[0].factsUsed).not.toContain("rates.v1");
  });
});

describe("MV4 debt-arbitrage grounding", () => {
  it("cites the APR−cash spread with asOf when a rate is passed", () => {
    const out = detectArbitrage(ledgerWith(20000, 4000, 22), RATE);
    if (out.length) {
      expect(out[0].headlineSlots.cashRatePct).toBe(4.3);
      expect(out[0].headlineSlots.spreadPct).toBeCloseTo(22 - 4.3, 2);
      expect(out[0].headlineSlots.rateAsOf).toBe("2026-07-13");
      expect(out[0].factsUsed).toContain("rates.v1");
    }
  });

  it("omits rate slots without a rate", () => {
    const out = detectArbitrage(ledgerWith(20000, 4000, 22), null);
    if (out.length) {
      expect(out[0].headlineSlots.cashRatePct).toBeUndefined();
      expect(out[0].factsUsed).not.toContain("rates.v1");
    }
  });
});
