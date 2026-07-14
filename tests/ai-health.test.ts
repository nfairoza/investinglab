import { describe, it, expect } from "vitest";
import { isFailingOverAnHour, type ProviderHealth } from "@/lib/ai/health";

const base: ProviderHealth = { provider: "gemini", lastSuccessAt: null, lastError: "boom", lastErrorAt: null, failStreak: 0, failingSince: null };
const NOW = Date.parse("2026-07-14T12:00:00Z");

describe("isFailingOverAnHour", () => {
  it("false when no failure streak", () => {
    expect(isFailingOverAnHour({ ...base, failStreak: 0, failingSince: null }, NOW)).toBe(false);
  });
  it("false when failing for under an hour", () => {
    const since = new Date(NOW - 30 * 60_000).toISOString();
    expect(isFailingOverAnHour({ ...base, failStreak: 3, failingSince: since }, NOW)).toBe(false);
  });
  it("true when failing for over an hour", () => {
    const since = new Date(NOW - 90 * 60_000).toISOString();
    expect(isFailingOverAnHour({ ...base, failStreak: 12, failingSince: since }, NOW)).toBe(true);
  });
  it("false for null health", () => {
    expect(isFailingOverAnHour(null, NOW)).toBe(false);
  });
});
