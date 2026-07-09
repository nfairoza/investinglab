import { describe, it, expect } from "vitest";
import {
  recordNotForMe, isKindMuted, downweight, rankWithFeedback,
  recordSurfaced, surfacedToday, surfacedIdsToday, MUTE_DAYS, type InsightFeedback,
} from "@/lib/insights/feedback";
import { applyGovernorPrecise } from "@/lib/insights/rank";
import type { StoredInsight } from "@/lib/insights/types";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

function ins(p: Partial<StoredInsight> & { id: string; kind: string; severity: 1 | 2 | 3 }): StoredInsight {
  return {
    subject: "", slots: {}, impactPerYear: 100, evidence: [], status: "new",
    positive: false, action: null, createdAt: new Date(NOW).toISOString(), ...p,
  } as StoredInsight;
}

describe("recordNotForMe / isKindMuted", () => {
  it("mutes a kind for 90 days and bumps the count", () => {
    let fb: InsightFeedback = {};
    fb = recordNotForMe(fb, "pace_anomaly", NOW);
    expect(fb.pace_anomaly.notForMeCount).toBe(1);
    expect(isKindMuted(fb, "pace_anomaly", NOW)).toBe(true);
    // Just before expiry still muted; after, not.
    expect(isKindMuted(fb, "pace_anomaly", NOW + (MUTE_DAYS - 1) * 86_400_000)).toBe(true);
    expect(isKindMuted(fb, "pace_anomaly", NOW + (MUTE_DAYS + 1) * 86_400_000)).toBe(false);
  });
  it("does not mute a kind never voted on", () => {
    expect(isKindMuted({}, "interest_bleed", NOW)).toBe(false);
  });
});

describe("downweight + rankWithFeedback", () => {
  it("sinks a repeatedly-dismissed kind below an equal-severity peer", () => {
    let fb: InsightFeedback = {};
    // pace_anomaly dismissed 3x → penalty; category_trend never.
    for (let i = 0; i < 3; i++) fb = recordNotForMe(fb, "pace_anomaly", NOW);
    expect(downweight(fb, "pace_anomaly")).toBe(3);

    const a = ins({ id: "pace", kind: "pace_anomaly", severity: 1, impactPerYear: 500 });
    const b = ins({ id: "trend", kind: "category_trend", severity: 1, impactPerYear: 400 });
    const ranked = rankWithFeedback([a, b], fb);
    // Despite higher impact, the down-voted pace kind ranks below.
    expect(ranked.map((r) => r.id)).toEqual(["trend", "pace"]);
  });

  it("never lets downweight cross a severity tier", () => {
    let fb: InsightFeedback = {};
    for (let i = 0; i < 5; i++) fb = recordNotForMe(fb, "interest_bleed", NOW);
    const sev3 = ins({ id: "s3", kind: "interest_bleed", severity: 3, impactPerYear: 100 });
    const sev1 = ins({ id: "s1", kind: "pace_anomaly", severity: 1, impactPerYear: 9999 });
    const ranked = rankWithFeedback([sev1, sev3], fb);
    expect(ranked[0].id).toBe("s3"); // severity still wins
  });
});

describe("surfaced ledger + precise governor", () => {
  it("counts distinct ids surfaced today and resets on a new day", () => {
    let led = recordSurfaced(null, ["a", "b"], NOW);
    expect(surfacedToday(led, NOW)).toBe(2);
    led = recordSurfaced(led, ["b", "c"], NOW); // b is a dup
    expect(surfacedToday(led, NOW)).toBe(3);
    // Next day resets.
    expect(surfacedToday(led, NOW + 86_400_000)).toBe(0);
  });

  it("re-showing an already-surfaced id is free (idempotent)", () => {
    const led = recordSurfaced(null, ["x", "y", "z"], NOW); // 3 already surfaced (== cap)
    const already = surfacedIdsToday(led, NOW);
    const rows = [
      ins({ id: "x", kind: "pace_anomaly", severity: 1 }),   // already surfaced → still visible
      ins({ id: "new1", kind: "idle_cash", severity: 1 }),   // fresh → over budget, withheld
    ];
    const { visible, newlySurfaced } = applyGovernorPrecise(rows, already, NOW);
    expect(visible.map((v) => v.id)).toEqual(["x"]);
    expect(newlySurfaced).toEqual([]);
  });

  it("surfaces fresh ids up to the daily budget and reports them", () => {
    const rows = [
      ins({ id: "n1", kind: "pace_anomaly", severity: 1 }),
      ins({ id: "n2", kind: "idle_cash", severity: 1 }),
      ins({ id: "n3", kind: "utilization", severity: 1 }),
      ins({ id: "n4", kind: "category_trend", severity: 1 }),
    ];
    const { visible, newlySurfaced } = applyGovernorPrecise(rows, new Set(), NOW);
    // MAX_NEW_PER_DAY is 3 → only 3 fresh surface.
    expect(newlySurfaced).toHaveLength(3);
    expect(visible).toHaveLength(3);
  });

  it("severity-3 always shows and never consumes budget", () => {
    const rows = [
      ins({ id: "s3", kind: "low_buffer", severity: 3 }),
      ins({ id: "n1", kind: "pace_anomaly", severity: 1 }),
    ];
    const already = new Set(["p", "q", "r"]); // budget already exhausted (3/3)
    const { visible, newlySurfaced } = applyGovernorPrecise(rows, already, NOW);
    expect(visible.some((v) => v.id === "s3")).toBe(true);
    expect(newlySurfaced).toEqual([]); // s3 didn't consume; n1 withheld
  });
});
