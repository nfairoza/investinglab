// SMOOTH S1 — pure throttle bookkeeping for prefetch, split out so it's unit-
// testable without SWR or the DOM. `shouldWarm` decides whether a key may be
// warmed given the last-warm timestamps and now; it MUTATES the map (records the
// warm) only when it returns true. This keeps the "once per key per 30s" guarantee
// verifiable in isolation.

export const PREFETCH_THROTTLE_MS = 30_000;

export function shouldWarm(
  lastWarmed: Map<string, number>,
  key: string,
  now: number,
  throttleMs: number = PREFETCH_THROTTLE_MS,
): boolean {
  // Use -Infinity (not 0) as the "never warmed" sentinel so a real now=0 still
  // warms — 0 is a legitimate timestamp in tests and clock-skew edge cases.
  const last = lastWarmed.has(key) ? lastWarmed.get(key)! : -Infinity;
  if (now - last < throttleMs) return false;
  lastWarmed.set(key, now);
  return true;
}
