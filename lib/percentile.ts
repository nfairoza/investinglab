// SMOOTH S5 — nearest-rank percentile over a numeric sample. Pure + unit-tested.
// Used by the admin nav-timing card to summarize click→render latency per route.

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest-rank: rank = ceil(p/100 * N), clamped to [1, N].
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1];
}

export interface RouteTiming { route: string; count: number; p50: number; p95: number }

// Group {route, ms} samples into per-route p50/p95, sorted by sample count desc.
export function summarizeTimings(samples: Array<{ route: string; ms: number }>): RouteTiming[] {
  const byRoute = new Map<string, number[]>();
  for (const s of samples) {
    if (!s.route || !Number.isFinite(s.ms)) continue;
    const arr = byRoute.get(s.route) ?? [];
    arr.push(s.ms);
    byRoute.set(s.route, arr);
  }
  const out: RouteTiming[] = [];
  for (const [route, ms] of byRoute) {
    out.push({ route, count: ms.length, p50: percentile(ms, 50) ?? 0, p95: percentile(ms, 95) ?? 0 });
  }
  return out.sort((a, b) => b.count - a.count);
}
