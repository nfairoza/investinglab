import { describe, it, expect } from "vitest";
import { isDailyStale, last8amEastEpoch } from "@/lib/daily-cache";

// 8am-ET boundary + maxAge staleness (P5).
describe("isDailyStale", () => {
  it("treats null/invalid as stale", () => {
    expect(isDailyStale(null)).toBe(true);
    expect(isDailyStale("not-a-date")).toBe(true);
  });

  it("fresh value from just now is not stale", () => {
    const now = Date.now();
    expect(isDailyStale(new Date(now).toISOString(), 12 * 3600_000, now)).toBe(false);
  });

  it("value from before the last 8am ET boundary is stale", () => {
    const now = Date.now();
    const boundary = last8amEastEpoch(now);
    const justBefore = new Date(boundary - 60_000).toISOString();
    expect(isDailyStale(justBefore, 999 * 3600_000, now)).toBe(true);
  });

  it("value older than maxAge is stale even if after the boundary", () => {
    const now = Date.now();
    // 1ms after boundary but maxAge tiny → the maxAge cap trips.
    const afterBoundary = new Date(last8amEastEpoch(now) + 1).toISOString();
    expect(isDailyStale(afterBoundary, 1, now)).toBe(true);
  });

  it("last8amEastEpoch is at or before now and within ~24h", () => {
    const now = Date.now();
    const b = last8amEastEpoch(now);
    expect(b).toBeLessThanOrEqual(now);
    expect(now - b).toBeLessThan(24 * 3600_000 + 1000);
  });
});
