"use client";

// SMOOTH S5 — nav-timing: measure click → first contentful render per route.
//
// The intent timestamp is stamped on the capturing click (recordNavIntent, called
// from the same listener that drives view transitions). The destination's
// <NavTiming> component reads it on the next pathname change and, after the content
// has painted (double rAF), beacons { route, ms } to /api/nav-timing — sampled so
// we don't log every navigation.

interface NavIntent { at: number; toPath: string | null }
let pending: NavIntent | null = null;

// Stamp the moment the user expressed intent to navigate (a click on an internal
// link). performance.now() is monotonic and cheap.
export function recordNavIntent(toPath: string | null): void {
  if (typeof performance === "undefined") return;
  pending = { at: performance.now(), toPath };
}

// Consume the pending intent if it targets `path` (or had no specific target).
// Returns elapsed ms since the click, or null if there's no matching intent
// (e.g. a back/forward or programmatic nav we didn't stamp).
export function consumeNavIntent(path: string): number | null {
  if (!pending || typeof performance === "undefined") return null;
  const { at, toPath } = pending;
  // Match on the path when we captured one; tolerate query differences.
  if (toPath && toPath.split("?")[0] !== path.split("?")[0]) return null;
  pending = null;
  return Math.max(0, performance.now() - at);
}

// Sampling: only beacon a fraction of navigations to keep error_log low-noise.
// Deterministic-ish per call via a rotating counter (no Math.random needed).
let sampleCounter = 0;
const SAMPLE_EVERY = 4; // ~25% of stamped navigations
export function shouldSample(): boolean {
  sampleCounter = (sampleCounter + 1) % SAMPLE_EVERY;
  return sampleCounter === 0;
}

export function beaconNavTiming(route: string, ms: number, cached: boolean): void {
  if (typeof navigator === "undefined") return;
  const body = JSON.stringify({ route, ms, cached });
  // sendBeacon survives the navigation and doesn't block; fall back to fetch.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/nav-timing", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch { /* fall through */ }
  fetch("/api/nav-timing", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}
