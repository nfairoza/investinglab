import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ETF probe-and-remember: a 4xx on a plan-tiered ETF endpoint returns the plan-
// notice unavailable() and is remembered (so we don't re-hit it). We mock the
// connector key + global fetch; server_cache writes are best-effort (try/catch) so
// they no-op without a DB.

vi.mock("@/lib/connectors/runtime", () => ({
  getConnectorValue: (k: string) => (k === "MARKET_DATA_API_KEY" ? "test-key" : null),
  hydrateConnectorCache: async () => {},
}));

// server_cache: no DB in the test — reads miss, writes no-op. The in-memory memo
// (etfDisabledMem Map) still holds within the module for the "remembered" assertion.
vi.mock("@/lib/server-cache", () => ({
  readServerCache: async () => ({ value: null, generatedAt: null, stale: true }),
  writeServerCache: async () => new Date().toISOString(),
}));

const realFetch = global.fetch;
let fetchCalls = 0;

beforeEach(() => {
  fetchCalls = 0;
  global.fetch = vi.fn(async () => {
    fetchCalls++;
    return new Response("Forbidden — plan required", { status: 403 });
  }) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = realFetch; vi.resetModules(); });

describe("ETF probe-and-remember", () => {
  it("a 4xx returns the plan-notice unavailable()", async () => {
    const { getEtfHoldings } = await import("@/lib/providers/fmp");
    const r = await getEtfHoldings("SOXL");
    expect(r.data).toBeNull();
    expect(r.source).toBe("unavailable");
    expect(r.note).toBe("not available on current data plan");
  });

  it("remembers the disabled endpoint — a second call does NOT hit the network again", async () => {
    const { getEtfHoldings } = await import("@/lib/providers/fmp");
    await getEtfHoldings("SOXL"); // first call: one fetch, records the memo
    const callsAfterFirst = fetchCalls;
    expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
    const r2 = await getEtfHoldings("VOO"); // different symbol, same disabled endpoint
    // The in-memory memo short-circuits: no additional fetch.
    expect(fetchCalls).toBe(callsAfterFirst);
    expect(r2.note).toBe("not available on current data plan");
  });
});
