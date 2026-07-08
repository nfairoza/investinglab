// Normalize a value series to percent change from its first point ("0% at open").
// Shared by the 1D charts so the portfolio and the SPY benchmark are directly
// comparable on the same axis. Pure + tested.

export interface SeriesPoint { v: number; date: string }
export interface PctPoint { date: string; pct: number }

export function normalizeToOpen(series: { v: number; date: string }[]): PctPoint[] {
  if (!series.length) return [];
  const base = series[0].v;
  if (!(base > 0)) return series.map((p) => ({ date: p.date, pct: 0 }));
  return series.map((p) => ({ date: p.date, pct: ((p.v - base) / base) * 100 }));
}

// The last normalized value (today's return %), or null if empty.
export function lastPct(points: PctPoint[]): number | null {
  return points.length ? points[points.length - 1].pct : null;
}
