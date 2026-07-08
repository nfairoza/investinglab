import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __fmpTest } from "@/lib/providers/fmp";

// Stale-while-revalidate on the non-quote endpoints (P5): an expired entry must
// serve its stale value immediately AND trigger exactly one background refresh,
// deduped no matter how many callers hit the stale entry at once.
const URL = "https://financialmodelingprep.com/stable/income-statement?symbol=AMD&apikey=SECRET";

describe("fmp getJson stale-while-revalidate", () => {
  beforeEach(() => {
    __fmpTest.reset();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves stale value immediately and refreshes exactly once in the background", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify([{ fresh: true }]), { status: 200 });
    }));

    // Prime L1 with a stale entry: aged past its 1ms TTL.
    __fmpTest.primeCache(URL, [{ fresh: false }], /*ageMs*/ 10, /*ttlMs*/ 1);

    // Fire several concurrent callers against the stale entry.
    const results = await Promise.all([
      __fmpTest.getJson(URL),
      __fmpTest.getJson(URL),
      __fmpTest.getJson(URL),
    ]);

    // Every caller got the STALE value back immediately, not the network value
    // (a blocking fetch would have resolved to [{ fresh: true }]).
    for (const r of results) expect(r).toEqual([{ fresh: false }]);

    // Let the single background refresh settle.
    await __fmpTest.flush();

    // Exactly one background refresh ran despite three stale reads.
    expect(calls).toBe(1);
    // And the cache is now updated with the fresh value.
    expect(__fmpTest.peek(URL)?.data).toEqual([{ fresh: true }]);
  });

  it("does not refresh when the entry is still fresh", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return new Response(JSON.stringify([{ fresh: true }]), { status: 200 });
    }));

    // Fresh entry: recently written, long TTL.
    __fmpTest.primeCache(URL, [{ fresh: false }], /*ageMs*/ 10, /*ttlMs*/ 60_000);

    const r = await __fmpTest.getJson(URL);
    await __fmpTest.flush();

    expect(r).toEqual([{ fresh: false }]);
    expect(calls).toBe(0); // no network at all
  });
});
