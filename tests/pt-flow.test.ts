import { describe, it, expect } from "vitest";
import { computeFlow, bandMidpoint, type FlowTrade } from "@/lib/power-trades/flow";
import { computeOverlap, type OverlapTrade, type OverlapHolding } from "@/lib/power-trades/overlap";

const t = (over: Partial<FlowTrade>): FlowTrade => ({
  ticker: "AAPL", sector: "Technology", type: "buy", amountMin: 1000, amountMax: 15000,
  chamber: "house", party: "D", month: "2026-06", ...over,
});

describe("bandMidpoint", () => {
  it("averages the band, falls back to max then min", () => {
    expect(bandMidpoint(1000, 15000)).toBe(8000);
    expect(bandMidpoint(null, 15000)).toBe(15000);
    expect(bandMidpoint(5000, null)).toBe(5000);
    expect(bandMidpoint(null, null)).toBe(0);
  });
});

describe("computeFlow", () => {
  it("nets buys against sells per sector and per ticker", () => {
    const r = computeFlow([
      t({ ticker: "AAPL", sector: "Technology", type: "buy", amountMin: 1000, amountMax: 15000 }),   // +8000
      t({ ticker: "MSFT", sector: "Technology", type: "buy", amountMin: 15000, amountMax: 50000 }),   // +32500
      t({ ticker: "XOM", sector: "Energy", type: "sell", amountMin: 1000, amountMax: 15000 }),        // -8000
    ]);
    const tech = r.bySector.find((s) => s.sector === "Technology")!;
    expect(tech.netBuy).toBe(40500);
    expect(tech.trades).toBe(2);
    const energy = r.bySector.find((s) => s.sector === "Energy")!;
    expect(energy.netBuy).toBe(-8000);
    expect(r.topBought[0].ticker).toBe("MSFT");
    expect(r.topSold[0].ticker).toBe("XOM");
    expect(r.totalTrades).toBe(3);
  });

  it("filters by chamber and party", () => {
    const trades = [
      t({ ticker: "AAPL", chamber: "house", party: "D", type: "buy" }),
      t({ ticker: "MSFT", chamber: "senate", party: "R", type: "buy" }),
    ];
    expect(computeFlow(trades, { chamber: "senate" }).totalTrades).toBe(1);
    expect(computeFlow(trades, { party: "D" }).totalTrades).toBe(1);
    expect(computeFlow(trades, { chamber: "all", party: "all" }).totalTrades).toBe(2);
  });

  it("ignores non-buy/sell types and zero-amount rows", () => {
    const r = computeFlow([
      t({ type: "exchange" }),
      t({ type: "buy", amountMin: null, amountMax: null }),
      t({ type: "buy", amountMin: 1000, amountMax: 15000 }),
    ]);
    expect(r.totalTrades).toBe(1);
  });

  it("sorts sectors by absolute net flow", () => {
    const r = computeFlow([
      t({ sector: "Energy", type: "sell", amountMin: 50000, amountMax: 100000 }),  // -75000
      t({ sector: "Technology", type: "buy", amountMin: 1000, amountMax: 15000 }), // +8000
    ]);
    expect(r.bySector[0].sector).toBe("Energy"); // larger |net|
  });
});

describe("computeOverlap", () => {
  const holdings: OverlapHolding[] = [{ symbol: "NVDA", value: 16000 }, { symbol: "AAPL", value: 3000 }];
  const trade = (over: Partial<OverlapTrade>): OverlapTrade => ({
    personName: "Rep. X", ticker: "NVDA", type: "buy", amountLabel: "$50K–100K", disclosureDate: "2026-07-01", ...over,
  });

  it("matches a followed person's buy on a held ticker", () => {
    const m = computeOverlap(["Rep. X"], holdings, [trade({})]);
    expect(m).toHaveLength(1);
    expect(m[0].ticker).toBe("NVDA");
    expect(m[0].heldValue).toBe(16000);
    expect(m[0].amountLabel).toBe("$50K–100K"); // band shown verbatim
  });

  it("ignores trades on tickers the user doesn't hold", () => {
    expect(computeOverlap(["Rep. X"], holdings, [trade({ ticker: "TSLA" })])).toHaveLength(0);
  });

  it("ignores people the user doesn't follow", () => {
    expect(computeOverlap(["Rep. Y"], holdings, [trade({ personName: "Rep. X" })])).toHaveLength(0);
  });

  it("sorts by held value, highest first", () => {
    const m = computeOverlap(["Rep. X"], holdings, [
      trade({ ticker: "AAPL" }),  // held 3000
      trade({ ticker: "NVDA" }),  // held 16000
    ]);
    expect(m[0].ticker).toBe("NVDA");
    expect(m[1].ticker).toBe("AAPL");
  });

  it("returns nothing with no follows or no holdings", () => {
    expect(computeOverlap([], holdings, [trade({})])).toHaveLength(0);
    expect(computeOverlap(["Rep. X"], [], [trade({})])).toHaveLength(0);
  });
});
