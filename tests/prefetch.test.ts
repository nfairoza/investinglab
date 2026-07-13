import { describe, it, expect } from "vitest";
import { shouldWarm, PREFETCH_THROTTLE_MS } from "@/lib/prefetch-throttle";
import { ROUTE_PRELOADS, preloadKeysFor, symbolPreloadKeys } from "@/lib/route-preloads";

describe("prefetch throttle — once per key per 30s", () => {
  it("warms once, then blocks repeats within the window", () => {
    const m = new Map<string, number>();
    // 10 hovers in the same instant → exactly 1 warm.
    let warms = 0;
    for (let i = 0; i < 10; i++) if (shouldWarm(m, "/api/holdings", 1_000)) warms++;
    expect(warms).toBe(1);
  });

  it("allows a second warm after the throttle window elapses", () => {
    const m = new Map<string, number>();
    expect(shouldWarm(m, "/api/holdings", 0)).toBe(true);
    expect(shouldWarm(m, "/api/holdings", PREFETCH_THROTTLE_MS - 1)).toBe(false); // still throttled
    expect(shouldWarm(m, "/api/holdings", PREFETCH_THROTTLE_MS + 1)).toBe(true);  // window passed
  });

  it("throttles per key independently", () => {
    const m = new Map<string, number>();
    expect(shouldWarm(m, "/api/holdings", 0)).toBe(true);
    expect(shouldWarm(m, "/api/networth", 0)).toBe(true); // different key, not throttled
    expect(shouldWarm(m, "/api/holdings", 0)).toBe(false);
  });

  it("ACCEPTANCE: hovering 10× in a minute yields ≤2 preload fetches per key", () => {
    const m = new Map<string, number>();
    // Simulate 10 hovers spread across 60s (every 6s).
    let warms = 0;
    for (let i = 0; i < 10; i++) if (shouldWarm(m, "/api/holdings", i * 6_000)) warms++;
    // 60s window at a 30s throttle → warms at t=0 and t=30s = 2.
    expect(warms).toBeLessThanOrEqual(2);
  });
});

describe("ROUTE_PRELOADS — guardrail 2 (cache-backed keys only)", () => {
  // Endpoints that can fall through to a live FMP/Plaid call on a cold cache and
  // therefore must NEVER be prefetched. A hover must not spend API budget.
  const FORBIDDEN = [
    "/api/overview",              // marketData.getQuotes → live FMP on miss
    "/api/income",                // marketData.getQuotes → live FMP on miss
    "/api/plaid/refresh",         // forces a live Plaid pull
  ];

  it("lists no forbidden live-call endpoint", () => {
    const all = Object.values(ROUTE_PRELOADS).flat();
    for (const key of all) {
      const base = key.split("?")[0];
      expect(FORBIDDEN).not.toContain(base);
    }
  });

  it("prefetches Plaid transactions only with sync=0 (never triggers a live sync)", () => {
    const all = Object.values(ROUTE_PRELOADS).flat();
    for (const key of all) {
      if (key.startsWith("/api/plaid/transactions")) {
        expect(key).toContain("sync=0");
      }
    }
  });

  it("Money maps to the real snapshot-backed keys, not /api/overview", () => {
    expect(ROUTE_PRELOADS["/money"]).toContain("/api/plaid/accounts");
    expect(ROUTE_PRELOADS["/money"]).not.toContain("/api/overview");
  });

  it("preloadKeysFor resolves a plain href and ignores query strings", () => {
    expect(preloadKeysFor("/holdings")).toEqual(["/api/holdings"]);
    expect(preloadKeysFor("/holdings?x=1")).toEqual(["/api/holdings"]);
    expect(preloadKeysFor("/unknown")).toEqual([]);
  });

  it("symbolPreloadKeys builds encoded quote+profile keys", () => {
    expect(symbolPreloadKeys("aapl")).toEqual(["/api/quote?symbol=AAPL", "/api/profile?symbol=AAPL"]);
  });
});
