import { describe, it, expect } from "vitest";
import { lagDays, closeAtOrAfter, computeTradeReturn, type PricePoint } from "@/lib/power-trades/returns";

// A small deterministic daily series (oldest -> newest), with a weekend gap
// (Jun 6-7 = Sat/Sun absent) so we can assert next-trading-day alignment.
const SERIES: PricePoint[] = [
  { date: "2026-06-01", close: 100 },
  { date: "2026-06-02", close: 102 },
  { date: "2026-06-03", close: 105 },
  { date: "2026-06-04", close: 104 },
  { date: "2026-06-05", close: 106 }, // Fri
  { date: "2026-06-08", close: 110 }, // Mon (weekend skipped)
  { date: "2026-06-09", close: 112 },
];

describe("lagDays", () => {
  it("counts calendar days between trade and disclosure", () => {
    expect(lagDays("2026-06-03", "2026-07-08")).toBe(35);
    expect(lagDays("2026-06-03", "2026-06-03")).toBe(0);
  });
  it("returns null on missing or negative (disclosure before trade)", () => {
    expect(lagDays(null, "2026-07-08")).toBeNull();
    expect(lagDays("2026-06-03", null)).toBeNull();
    expect(lagDays("2026-07-08", "2026-06-03")).toBeNull();
  });
});

describe("closeAtOrAfter", () => {
  it("returns the exact close on a trading day", () => {
    expect(closeAtOrAfter(SERIES, "2026-06-03")).toBe(105);
  });
  it("rolls a weekend date forward to the next trading day's close", () => {
    expect(closeAtOrAfter(SERIES, "2026-06-06")).toBe(110); // Sat -> Mon
    expect(closeAtOrAfter(SERIES, "2026-06-07")).toBe(110); // Sun -> Mon
  });
  it("returns null past the last point", () => {
    expect(closeAtOrAfter(SERIES, "2026-06-20")).toBeNull();
  });
});

describe("computeTradeReturn", () => {
  it("computes lag + since-trade + since-disclosure from disclosure/trade closes to latest", () => {
    const r = computeTradeReturn(SERIES, "2026-06-03", "2026-06-05", "2026-06-09");
    expect(r.lagDays).toBe(2);
    expect(r.tradeClose).toBe(105);
    expect(r.disclosureClose).toBe(106);
    expect(r.latestClose).toBe(112);
    expect(r.asOf).toBe("2026-06-09");
    // (112-105)/105 = 6.666..%
    expect(r.sinceTradePct).toBeCloseTo(6.6667, 3);
    // (112-106)/106 = 5.660..%
    expect(r.sinceDisclosurePct).toBeCloseTo(5.6604, 3);
  });

  it("bounds 'latest' at nowDate (no peeking at future closes)", () => {
    const r = computeTradeReturn(SERIES, "2026-06-03", "2026-06-05", "2026-06-05");
    expect(r.latestClose).toBe(106);
    expect(r.asOf).toBe("2026-06-05");
    expect(r.sinceTradePct).toBeCloseTo(0.952, 2); // (106-105)/105
  });

  it("uses the last available close when nowDate is a non-trading day", () => {
    const r = computeTradeReturn(SERIES, "2026-06-03", "2026-06-05", "2026-06-07"); // Sunday
    expect(r.asOf).toBe("2026-06-05"); // last close on/before Sunday is Friday
    expect(r.latestClose).toBe(106);
  });

  it("returns null percentages when the ticker has no history", () => {
    const r = computeTradeReturn([], "2026-06-03", "2026-06-05", "2026-06-09");
    expect(r.sinceTradePct).toBeNull();
    expect(r.sinceDisclosurePct).toBeNull();
    expect(r.latestClose).toBeNull();
    expect(r.lagDays).toBe(2); // lag is date-only, still computable
  });
});
