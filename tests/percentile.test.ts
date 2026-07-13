import { describe, it, expect } from "vitest";
import { percentile, summarizeTimings } from "@/lib/percentile";

describe("percentile (nearest-rank)", () => {
  it("returns null for empty input", () => {
    expect(percentile([], 50)).toBeNull();
  });
  it("p50 / p95 over 1..100", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 100)).toBe(100);
  });
  it("handles a single sample", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });
  it("does not mutate the input array", () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });
});

describe("summarizeTimings", () => {
  it("groups per route with p50/p95, sorted by count desc", () => {
    const samples = [
      ...Array.from({ length: 10 }, () => ({ route: "/holdings", ms: 80 })),
      { route: "/holdings", ms: 500 },
      { route: "/money", ms: 90 },
      { route: "/money", ms: 300 },
    ];
    const out = summarizeTimings(samples);
    expect(out[0].route).toBe("/holdings");   // most samples first
    expect(out[0].count).toBe(11);
    expect(out[0].p50).toBe(80);              // the bulk of holdings renders fast
    expect(out.find((r) => r.route === "/money")?.count).toBe(2);
  });
  it("skips malformed samples", () => {
    const out = summarizeTimings([{ route: "", ms: 5 }, { route: "/x", ms: NaN }, { route: "/x", ms: 10 }]);
    expect(out).toEqual([{ route: "/x", count: 1, p50: 10, p95: 10 }]);
  });
});
