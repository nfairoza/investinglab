import { describe, it, expect } from "vitest";
import { analysisAge, isAnalysisStale, needsAutoEnrich, ANALYSIS_STALE_DAYS } from "@/lib/watchlist/age";

const NOW = Date.parse("2026-07-13T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe("analysisAge", () => {
  it("returns null when never analyzed", () => {
    expect(analysisAge(null, NOW)).toBeNull();
    expect(analysisAge(undefined, NOW)).toBeNull();
    expect(analysisAge("not-a-date", NOW)).toBeNull();
  });

  it("labels recent ages in human units", () => {
    expect(analysisAge(ago(30 * 1000), NOW)!.label).toBe("just now");
    expect(analysisAge(ago(5 * MIN), NOW)!.label).toBe("5m ago");
    expect(analysisAge(ago(3 * HOUR), NOW)!.label).toBe("3h ago");
    expect(analysisAge(ago(2 * DAY), NOW)!.label).toBe("2d ago");
  });

  it("turns amber only past the stale-days threshold", () => {
    expect(analysisAge(ago(2 * DAY), NOW)!.amber).toBe(false);
    expect(analysisAge(ago(3 * DAY), NOW)!.amber).toBe(false); // exactly 3d, not yet over
    expect(analysisAge(ago((ANALYSIS_STALE_DAYS + 1) * DAY), NOW)!.amber).toBe(true);
  });
});

describe("isAnalysisStale — has prior content aged past a day", () => {
  it("never-analyzed is NOT 'stale' (distinct case)", () => {
    expect(isAnalysisStale(null, NOW)).toBe(false);
  });
  it("fresh (<1d) is not stale; >1d is", () => {
    expect(isAnalysisStale(ago(12 * HOUR), NOW)).toBe(false);
    expect(isAnalysisStale(ago(DAY + MIN), NOW)).toBe(true);
  });
});

describe("needsAutoEnrich — the viewport auto-refresh trigger", () => {
  it("fires for a never-analyzed row (new ticker gets first analysis, no button)", () => {
    expect(needsAutoEnrich(null, NOW)).toBe(true);
    expect(needsAutoEnrich(undefined, NOW)).toBe(true);
  });
  it("fires for a daily-stale row", () => {
    expect(needsAutoEnrich(ago(DAY + HOUR), NOW)).toBe(true);
  });
  it("does NOT fire for a fresh row (served from cache)", () => {
    expect(needsAutoEnrich(ago(2 * HOUR), NOW)).toBe(false);
  });
});
