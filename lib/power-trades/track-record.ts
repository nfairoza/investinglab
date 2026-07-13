// =============================================================================
// PT3 — Track records. "Does following this person's disclosed buys work?"
//
// Pure, deterministic math so it can be golden-tested with fixture price series.
// The nightly `pt-track-records` cron feeds it a person's disclosed BUYs plus
// cached daily closes for each ticker and for SPY, and stores the result.
//
// Method (see docs/PT_METHOD.md):
//   - Only DISCLOSED BUYS in the trailing 24 months. Measured from the DISCLOSURE
//     date (the actionable date — that's when the public could have acted), not
//     the trade date. Options excluded.
//   - Excess return = the stock's return from disclosure close to +Nd close,
//     MINUS SPY's return over the same calendar window. This is a market-neutral
//     "did this pick beat just buying the index" number.
//   - Windows: +30 / +90 / +180 calendar days. A non-trading target day rolls
//     forward to the next available close (both legs aligned the same way).
//   - Win rate = share of trades with positive EXCESS return.
//   - Honesty guard: n < MIN_TRADES → the caller shows "insufficient history",
//     never a percentage. Amount bands are NOT used here (equal-weighted trades).
// =============================================================================

import { closeAtOrAfter, type PricePoint } from "./returns";

export const MIN_TRADES = 8;
export const WINDOWS = [30, 90, 180] as const;
export type TrackWindowDays = (typeof WINDOWS)[number];

export interface DisclosedBuy {
  ticker: string;
  disclosureDate: string; // YYYY-MM-DD (the actionable date)
}

export interface WindowStat {
  window: TrackWindowDays;
  n: number;
  meanExcessPct: number | null; // null when n < MIN_TRADES
  medianExcessPct: number | null;
  winRatePct: number | null; // share with positive excess
  excesses: number[]; // per-trade excess returns (for the distribution strip)
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

function ret(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from <= 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return (to - from) / from;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Compute per-window excess-return stats for a person's disclosed buys.
 * `pricesByTicker` maps each ticker to its daily closes (oldest→newest);
 * `spy` is SPY's daily closes. Trades whose window extends past the last
 * available close (not enough forward data yet) are skipped for that window.
 */
export function computeTrackRecord(
  buys: DisclosedBuy[],
  pricesByTicker: Record<string, PricePoint[]>,
  spy: PricePoint[],
): WindowStat[] {
  return WINDOWS.map((window) => {
    const excesses: number[] = [];
    for (const b of buys) {
      const series = pricesByTicker[b.ticker.toUpperCase()];
      if (!series || series.length === 0) continue;
      const start = b.disclosureDate;
      const end = addDays(start, window);

      const stockFrom = closeAtOrAfter(series, start);
      const stockTo = closeAtOrAfter(series, end);
      const spyFrom = closeAtOrAfter(spy, start);
      const spyTo = closeAtOrAfter(spy, end);

      const stockR = ret(stockFrom, stockTo);
      const spyR = ret(spyFrom, spyTo);
      if (stockR == null || spyR == null) continue; // window not fully realized yet
      excesses.push((stockR - spyR) * 100);
    }

    const n = excesses.length;
    const enough = n >= MIN_TRADES;
    return {
      window,
      n,
      meanExcessPct: enough ? mean(excesses) : null,
      medianExcessPct: enough ? median(excesses) : null,
      winRatePct: enough ? (excesses.filter((e) => e > 0).length / n) * 100 : null,
      excesses,
    };
  });
}
