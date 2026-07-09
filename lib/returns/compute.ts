// =============================================================================
// F5 — portfolio return vs benchmark. Pure math (unit-tested). V1 uses a naive
// time-weighted-return proxy over the investment-balance series from
// net_worth_snapshots: percentage change of the investment total between the
// window start and end. This does NOT correct for cash flows (deposits/
// withdrawals) — a big deposit looks like a gain. The UI states this limitation
// honestly (see docs/RETURNS.md). A cash-flow-correct TWR is a later upgrade.
//
// Benchmark return = simple price change of the benchmark over the same window.
// =============================================================================

export type Period = "1M" | "3M" | "YTD" | "1Y";

export interface SeriesPoint { date: string; value: number }  // date = YYYY-MM-DD

// Window start date (YYYY-MM-DD) for a period, given "now".
export function windowStart(period: Period, nowMs: number): string {
  const now = new Date(nowMs);
  if (period === "YTD") return `${now.getUTCFullYear()}-01-01`;
  const d = new Date(nowMs);
  if (period === "1M") d.setUTCMonth(d.getUTCMonth() - 1);
  else if (period === "3M") d.setUTCMonth(d.getUTCMonth() - 3);
  else d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// Percentage change of a series between the first point on/after `startDate` and
// the last point. Returns null if fewer than 2 usable points or a zero start.
export function periodReturnPct(series: SeriesPoint[], startDate: string): number | null {
  const sorted = series.slice().filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  const inWindow = sorted.filter((p) => p.date >= startDate);
  const pts = inWindow.length >= 2 ? inWindow : sorted.slice(-2);
  if (pts.length < 2) return null;
  const start = pts[0].value;
  const end = pts[pts.length - 1].value;
  if (!start || start === 0) return null;
  return +(((end - start) / start) * 100).toFixed(2);
}

export interface ComparisonRow { period: Period; portfolioPct: number | null; benchmarkPct: number | null }

// Build the comparison across all periods for one benchmark.
export function buildComparison(
  portfolio: SeriesPoint[],
  benchmark: SeriesPoint[],
  nowMs: number,
  periods: Period[] = ["1M", "3M", "YTD", "1Y"],
): ComparisonRow[] {
  return periods.map((period) => {
    const start = windowStart(period, nowMs);
    return { period, portfolioPct: periodReturnPct(portfolio, start), benchmarkPct: periodReturnPct(benchmark, start) };
  });
}

// Detect whether a deposit/withdrawal likely distorts the window: a single
// day-over-day jump exceeding `threshold` (default 20%) in the portfolio series.
// Used to surface an honest "may include deposits" caveat.
export function hasLikelyCashFlow(series: SeriesPoint[], startDate: string, threshold = 0.2): boolean {
  const pts = series.slice().filter((p) => p.date >= startDate && Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].value;
    if (prev > 0 && Math.abs(pts[i].value - prev) / prev > threshold) return true;
  }
  return false;
}
