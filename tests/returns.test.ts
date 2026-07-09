import { describe, it, expect } from "vitest";
import { periodReturnPct, windowStart, buildComparison, hasLikelyCashFlow, type SeriesPoint } from "@/lib/returns/compute";

// F5 acceptance: benchmark comparison matches a hand-computed value within
// rounding for a simple no-cashflow month.
describe("periodReturnPct", () => {
  it("computes a simple percentage change over the window", () => {
    const series: SeriesPoint[] = [
      { date: "2026-01-01", value: 10000 },
      { date: "2026-02-01", value: 11000 },
    ];
    // +10% hand-computed.
    expect(periodReturnPct(series, "2026-01-01")).toBe(10);
  });

  it("returns null with fewer than two usable points", () => {
    expect(periodReturnPct([{ date: "2026-01-01", value: 100 }], "2026-01-01")).toBeNull();
  });

  it("returns null on a zero start value (no divide blowup)", () => {
    expect(periodReturnPct([{ date: "2026-01-01", value: 0 }, { date: "2026-02-01", value: 100 }], "2026-01-01")).toBeNull();
  });
});

describe("windowStart", () => {
  it("YTD is Jan 1 of the current year", () => {
    expect(windowStart("YTD", Date.UTC(2026, 5, 15))).toBe("2026-01-01");
  });
  it("1M is one month back", () => {
    expect(windowStart("1M", Date.UTC(2026, 5, 15))).toBe("2026-05-15");
  });
});

describe("buildComparison", () => {
  it("computes portfolio vs benchmark for each period, within rounding", () => {
    const now = Date.UTC(2026, 1, 1); // Feb 1 2026
    const portfolio: SeriesPoint[] = [{ date: "2026-01-01", value: 10000 }, { date: "2026-02-01", value: 10500 }];
    const benchmark: SeriesPoint[] = [{ date: "2026-01-01", value: 500 }, { date: "2026-02-01", value: 520 }];
    const rows = buildComparison(portfolio, benchmark, now, ["YTD"]);
    // Portfolio +5%, benchmark +4% (520/500).
    expect(rows[0].portfolioPct).toBeCloseTo(5, 5);
    expect(rows[0].benchmarkPct).toBeCloseTo(4, 5);
  });
});

describe("hasLikelyCashFlow", () => {
  it("flags a big single-step jump as a likely deposit", () => {
    const series: SeriesPoint[] = [{ date: "2026-01-01", value: 10000 }, { date: "2026-01-15", value: 20000 }];
    expect(hasLikelyCashFlow(series, "2026-01-01")).toBe(true);
  });
  it("does not flag smooth growth", () => {
    const series: SeriesPoint[] = [{ date: "2026-01-01", value: 10000 }, { date: "2026-01-15", value: 10200 }];
    expect(hasLikelyCashFlow(series, "2026-01-01")).toBe(false);
  });
});
