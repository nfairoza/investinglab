import { describe, it, expect } from "vitest";
import { evaluateBudget, isAnomalousUser, budgetFor } from "@/lib/ai/budget";

describe("evaluateBudget", () => {
  it("is 'none' under 80%", () => {
    const s = evaluateBudget("chat", 1_000_000); // budget 5M → 20%
    expect(s.warn).toBe(false);
    expect(s.exhausted).toBe(false);
    expect(s.degrade).toBe("none");
  });

  it("warns at 80%", () => {
    const b = budgetFor("chat")!;
    const s = evaluateBudget("chat", b.dailyTokens * 0.85);
    expect(s.warn).toBe(true);
    expect(s.exhausted).toBe(false);
    expect(s.degrade).toBe("none");
  });

  it("degrades per the feature's step at 100%", () => {
    const b = budgetFor("insights-narration")!;
    const s = evaluateBudget("insights-narration", b.dailyTokens + 1);
    expect(s.exhausted).toBe(true);
    expect(s.degrade).toBe("template"); // narration → templates
  });

  it("chat degrades to economy, never off", () => {
    const b = budgetFor("chat")!;
    expect(evaluateBudget("chat", b.dailyTokens * 2).degrade).toBe("economy");
  });

  it("unknown feature is uncapped ('none')", () => {
    const s = evaluateBudget("mystery", 999_999_999);
    expect(s.exhausted).toBe(false);
    expect(s.degrade).toBe("none");
  });
});

describe("isAnomalousUser", () => {
  it("flags a user over 3x fleet p95", () => {
    expect(isAnomalousUser(400, 100)).toBe(true);   // 4x
    expect(isAnomalousUser(250, 100)).toBe(false);  // 2.5x
  });
  it("no anomaly when the fleet has no baseline", () => {
    expect(isAnomalousUser(1000, 0)).toBe(false);
  });
});
