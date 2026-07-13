"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { consumeNavIntent, beaconNavTiming, shouldSample } from "@/lib/nav-timing";

// SMOOTH S5 — mounted once in the app frame. On each pathname change it consumes
// the click-intent timestamp and, after the new page's content has painted (double
// rAF ≈ first contentful render), beacons the elapsed ms to /api/nav-timing.
//
// "cached" is inferred: a render that completes within ~120ms almost certainly
// came from SWR cache (no network round-trip), which is exactly the S2/S1 fast
// path we want to confirm in the admin p50/p95.
export function NavTiming() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial mount (full page load, not an in-app navigation).
    if (first.current) { first.current = false; return; }

    const ms = consumeNavIntent(pathname || "/");
    if (ms == null) return;            // not a click-driven nav we stamped
    if (!shouldSample()) return;       // keep the log low-noise

    // Two rAFs: first fires before paint, second after the browser has painted the
    // new content — a good proxy for "first contentful data render".
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        beaconNavTiming(pathname || "/", ms, ms < 120);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [pathname]);

  return null;
}
