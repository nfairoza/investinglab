import { describe, it, expect } from "vitest";
import { assertNoNumerals, fillSlots, templateFor } from "@/lib/insights/narrate";
import { rankInsights, applyGovernor } from "@/lib/insights/rank";
import type { StoredInsight } from "@/lib/insights/types";

// The narration validator is the enforcement of "the LLM never computes". A
// poisoned model response (one containing a digit) MUST be rejected.
describe("assertNoNumerals (validator)", () => {
  it("accepts digit-free prose", () => {
    expect(assertNoNumerals("Spending is running high in dining — worth a look.")).toBe(true);
  });
  it("rejects any output containing a numeral (poisoned mock)", () => {
    expect(assertNoNumerals("You spent $450 on dining")).toBe(false);
    expect(assertNoNumerals("that's 3x your usual")).toBe(false);
  });
});

describe("fillSlots", () => {
  it("injects numbers ONLY at the template step, formatting money and percent", () => {
    const t = templateFor("pace_anomaly");
    const filled = fillSlots(t.body, { category: "Food & Dining", projected: 450, baseline: 200, overPct: 125, extra: 250 });
    expect(filled).toContain("Food & Dining");
    expect(filled).toContain("450");
    expect(filled).toContain("125");
    // No leftover placeholders.
    expect(/\{\w+\}/.test(filled)).toBe(false);
  });
});

function ins(p: Partial<StoredInsight> & { id: string; severity: 1 | 2 | 3 }): StoredInsight {
  return {
    kind: "k", subject: "s", slots: {}, impactPerYear: 100, evidence: [], status: "new",
    positive: false, action: null, createdAt: new Date().toISOString(), ...p,
  } as StoredInsight;
}

describe("rank + frequency governor", () => {
  it("ranks by severity then impact/yr", () => {
    const ranked = rankInsights([
      ins({ id: "a", severity: 1, impactPerYear: 5000 }),
      ins({ id: "b", severity: 3, impactPerYear: 100 }),
      ins({ id: "c", severity: 2, impactPerYear: 900 }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("caps new insights at 3/day but exempts severity-3", () => {
    const ranked = rankInsights([
      ins({ id: "s3", severity: 3 }),
      ins({ id: "n1", severity: 1 }),
      ins({ id: "n2", severity: 1 }),
      ins({ id: "n3", severity: 2 }),
      ins({ id: "n4", severity: 1 }),
    ]);
    // Already shown 2 new today → budget 1 for non-sev3; sev3 always shows.
    const out = applyGovernor(ranked, 2);
    expect(out.some((i) => i.id === "s3")).toBe(true);       // sev-3 exempt
    const nonSev3 = out.filter((i) => i.severity !== 3);
    expect(nonSev3.length).toBe(1);                          // only 1 of the remaining new
  });
});
