import { describe, it, expect } from "vitest";
import { planRoute } from "@/lib/ai/router";

// Route plans per task × strategy (P5). Asserts the approved policy: deep
// analysis leads with Claude Opus; light/casual stay cheap on Gemini.
describe("planRoute", () => {
  it("smart: deep-analysis leads with Claude Opus", () => {
    const p = planRoute("deep-analysis", "smart");
    expect(p.primary).toBe("claude");
    expect(p.claudeModel).toContain("opus");
  });

  it("smart: light task stays cheap on Gemini", () => {
    const p = planRoute("light", "smart");
    expect(p.primary).toBe("gemini");
  });

  it("smart: structured leads with Gemini", () => {
    expect(planRoute("structured", "smart").primary).toBe("gemini");
  });

  it("quality: even light stays cheap (no wasteful Opus)", () => {
    const p = planRoute("light", "quality");
    expect(p.primary).toBe("gemini");
    expect(p.claudeModel).toContain("haiku");
  });

  it("quality: deep-analysis uses Opus", () => {
    expect(planRoute("deep-analysis", "quality").claudeModel).toContain("opus");
  });

  it("economy: only deep-analysis escalates to Opus", () => {
    expect(planRoute("deep-analysis", "economy").claudeModel).toContain("opus");
    expect(planRoute("chat-casual", "economy").claudeModel).toContain("haiku");
  });

  it("every plan names both providers' models + a reason", () => {
    for (const task of ["deep-analysis", "structured", "chat-analysis", "chat-casual", "light"] as const) {
      for (const strat of ["smart", "quality", "economy"] as const) {
        const p = planRoute(task, strat);
        expect(p.claudeModel).toBeTruthy();
        expect(p.geminiModel).toBeTruthy();
        expect(p.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
