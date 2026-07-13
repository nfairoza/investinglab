import { describe, it, expect } from "vitest";
import { detectLeverage, isSwapBased } from "@/lib/etf/classify";
import type { EtfHolding } from "@/lib/providers/types";

describe("detectLeverage", () => {
  it("detects 3x leveraged from an explicit multiple (SOXL)", () => {
    const r = detectLeverage("Direxion Daily Semiconductor Bull 3X Shares");
    expect(r.leveraged).toBe(true);
    expect(r.factor).toBe(3);
    expect(r.inverse).toBe(false);
  });

  it("detects inverse (-1x) funds", () => {
    const r = detectLeverage("ProShares Short S&P500");
    expect(r.inverse).toBe(true);
    expect(r.factor).toBeLessThan(0);
  });

  it("detects 3x inverse (SOXS)", () => {
    const r = detectLeverage("Direxion Daily Semiconductor Bear 3X Shares");
    expect(r.inverse).toBe(true);
    expect(r.factor).toBe(-3);
  });

  it("does NOT flag a plain index fund (VOO)", () => {
    const r = detectLeverage("Vanguard S&P 500 ETF");
    expect(r.leveraged).toBe(false);
    expect(r.inverse).toBe(false);
    expect(r.factor).toBe(1);
  });

  it("detects Ultra (2x) word cue", () => {
    const r = detectLeverage("ProShares Ultra QQQ");
    expect(r.factor).toBe(2);
    expect(r.leveraged).toBe(true);
  });

  it("handles null/empty names", () => {
    expect(detectLeverage(null).leveraged).toBe(false);
    expect(detectLeverage("").leveraged).toBe(false);
  });
});

describe("isSwapBased", () => {
  const equity = (weight: number, symbol: string): EtfHolding => ({ symbol, name: symbol, weight, isEquity: true });
  const swap = (weight: number, name: string): EtfHolding => ({ symbol: null, name, weight, isEquity: false });

  it("flags a swap-dominated fund (SOXL-style)", () => {
    const holdings = [swap(70, "Total Return Swap"), swap(20, "Cash Collateral"), equity(10, "NVDA")];
    const r = isSwapBased(holdings);
    expect(r.swapBased).toBe(true);
    expect(r.equityWeight).toBeLessThan(40);
  });

  it("does NOT flag a plain equity ETF (VOO-style)", () => {
    const holdings = [equity(7, "AAPL"), equity(6, "MSFT"), equity(5, "NVDA"), equity(82, "OTHERS")];
    const r = isSwapBased(holdings);
    expect(r.swapBased).toBe(false);
    expect(r.equityWeight).toBeGreaterThan(90);
  });

  it("handles empty holdings", () => {
    expect(isSwapBased([]).swapBased).toBe(false);
    expect(isSwapBased(null).swapBased).toBe(false);
  });
});
