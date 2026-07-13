import { describe, it, expect } from "vitest";
import { computeTrackRecord, MIN_TRADES, type DisclosedBuy } from "@/lib/power-trades/track-record";
import type { PricePoint } from "@/lib/power-trades/returns";

// Build a flat daily series where close = base on day 0, then a single step-up
// applied from `bumpDate` onward. Lets us construct known +Nd returns.
function series(startClose: number, dates: string[], closes: number[]): PricePoint[] {
  return dates.map((d, i) => ({ date: d, close: closes[i] ?? startClose }));
}

// A dense daily calendar (weekdays + weekends, simplest: every calendar day) so
// +30d lands on an exact present date. Values chosen so returns are round.
function calendar(from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= days; i++) out.push(new Date(Date.parse(from + "T00:00:00Z") + i * 86400000).toISOString().slice(0, 10));
  return out;
}

describe("computeTrackRecord", () => {
  it("computes excess vs SPY at +30d from disclosure date", () => {
    const dates = calendar("2026-01-01", 40);
    // Stock: 100 → 120 by day 30 (+20%). SPY: 100 → 105 (+5%). Excess +15%.
    const stockCloses = dates.map((_, i) => (i >= 30 ? 120 : 100));
    const spyCloses = dates.map((_, i) => (i >= 30 ? 105 : 100));
    // 8 buys (meet MIN_TRADES) all same setup → mean excess = median = +15, win 100%.
    const buys: DisclosedBuy[] = Array.from({ length: MIN_TRADES }, () => ({ ticker: "ABC", disclosureDate: "2026-01-01" }));
    const stats = computeTrackRecord(buys, { ABC: series(100, dates, stockCloses) }, series(100, dates, spyCloses));
    const w30 = stats.find((s) => s.window === 30)!;
    expect(w30.n).toBe(MIN_TRADES);
    expect(w30.meanExcessPct).toBeCloseTo(15, 5);
    expect(w30.medianExcessPct).toBeCloseTo(15, 5);
    expect(w30.winRatePct).toBe(100);
  });

  it("suppresses percentages when n < MIN_TRADES (insufficient history)", () => {
    const dates = calendar("2026-01-01", 40);
    const closes = dates.map((_, i) => (i >= 30 ? 120 : 100));
    const spy = dates.map((_, i) => (i >= 30 ? 105 : 100));
    const buys: DisclosedBuy[] = Array.from({ length: 3 }, () => ({ ticker: "ABC", disclosureDate: "2026-01-01" }));
    const stats = computeTrackRecord(buys, { ABC: series(100, dates, closes) }, series(100, dates, spy));
    const w30 = stats.find((s) => s.window === 30)!;
    expect(w30.n).toBe(3);
    expect(w30.meanExcessPct).toBeNull();
    expect(w30.winRatePct).toBeNull();
    expect(w30.excesses).toHaveLength(3); // raw still available for the strip
  });

  it("skips trades whose window isn't fully realized yet (no future close)", () => {
    // Only 10 days of data — +30d has no target close, so 30d n=0.
    const dates = calendar("2026-01-01", 10);
    const closes = dates.map(() => 100);
    const buys: DisclosedBuy[] = Array.from({ length: MIN_TRADES }, () => ({ ticker: "ABC", disclosureDate: "2026-01-01" }));
    const stats = computeTrackRecord(buys, { ABC: series(100, dates, closes) }, series(100, dates, closes));
    expect(stats.find((s) => s.window === 30)!.n).toBe(0);
    expect(stats.find((s) => s.window === 30)!.meanExcessPct).toBeNull();
  });

  it("aligns a non-trading target day forward to the next close (both legs same)", () => {
    // Sparse weekly series: day 0, +28, +35. +30d target rolls to +35 close.
    const dates = ["2026-01-01", "2026-01-29", "2026-02-05"];
    const stock = [100, 110, 130]; // +35d close = 130 → +30%
    const spy = [100, 102, 110];   // +35d close = 110 → +10% → excess +20
    const buys: DisclosedBuy[] = Array.from({ length: MIN_TRADES }, () => ({ ticker: "ABC", disclosureDate: "2026-01-01" }));
    const stats = computeTrackRecord(buys, { ABC: series(100, dates, stock) }, series(100, dates, spy));
    expect(stats.find((s) => s.window === 30)!.meanExcessPct).toBeCloseTo(20, 4);
  });

  it("mixes winners and losers into a real win rate", () => {
    const dates = calendar("2026-01-01", 40);
    const up = series(100, dates, dates.map((_, i) => (i >= 30 ? 120 : 100)));   // +20%
    const down = series(100, dates, dates.map((_, i) => (i >= 30 ? 90 : 100)));   // -10%
    const spy = series(100, dates, dates.map((_, i) => (i >= 30 ? 105 : 100)));   // +5%
    // 5 winners (excess +15), 5 losers (excess -15) → mean 0, win rate 50%.
    const buys: DisclosedBuy[] = [
      ...Array.from({ length: 5 }, () => ({ ticker: "UP", disclosureDate: "2026-01-01" })),
      ...Array.from({ length: 5 }, () => ({ ticker: "DN", disclosureDate: "2026-01-01" })),
    ];
    const stats = computeTrackRecord(buys, { UP: up, DN: down }, spy);
    const w30 = stats.find((s) => s.window === 30)!;
    expect(w30.n).toBe(10);
    expect(w30.meanExcessPct).toBeCloseTo(0, 4);
    expect(w30.winRatePct).toBe(50);
  });
});
