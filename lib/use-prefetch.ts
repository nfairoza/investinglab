"use client";

import { useCallback } from "react";
import { preload } from "swr";
import { fetchJson } from "@/lib/fetch-json";
import { preloadKeysFor, symbolPreloadKeys } from "@/lib/route-preloads";
import { shouldWarm } from "@/lib/prefetch-throttle";

// SMOOTH S1 — fetch before the click.
//
// On pointerenter / touchstart of a nav item, sub-tab, ⌘K result, or holdings/
// watchlist row, warm SWR's cache for the destination's primary keys so the route
// mounts with data already present → no skeleton (see S2). This is a HINT, so:
//   - Throttled to once per key per 30s (a hover storm can't inflate API budget).
//   - Skipped entirely under Data Saver (navigator.connection.saveData).
//   - Only warms cache-backed keys from ROUTE_PRELOADS / symbolPreloadKeys
//     (guardrail 2 — a hover must never trigger a live FMP/Plaid call by itself).

// Module-level (survives component remounts) last-warm time per key.
const lastWarmed = new Map<string, number>();

function saveDataOn(): boolean {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

function warm(keys: string[]): void {
  if (!keys.length || saveDataOn()) return;
  const now = Date.now();
  for (const key of keys) {
    if (!shouldWarm(lastWarmed, key, now)) continue;   // throttle per key (30s)
    // preload uses the same fetcher SWR reads with, so the warmed entry is a cache
    // hit for the page's useSWR(key). Errors are swallowed — a failed warm is a
    // no-op, the page will just fetch normally.
    preload(key, fetchJson).catch(() => {});
  }
}

export interface PrefetchHandlers {
  onPointerEnter: () => void;
  onTouchStart: () => void;
}

// Returns spread-able handlers that warm the given href's preload keys. Attach to
// nav links / rows: `<Link {...usePrefetch(href)} />`.
export function usePrefetch(href: string): PrefetchHandlers {
  const run = useCallback(() => warm(preloadKeysFor(href)), [href]);
  return { onPointerEnter: run, onTouchStart: run };
}

// Symbol-row variant: warm a ticker's quote + profile before navigating to it.
export function usePrefetchSymbol(symbol: string | null | undefined): PrefetchHandlers {
  const run = useCallback(() => { if (symbol) warm(symbolPreloadKeys(symbol)); }, [symbol]);
  return { onPointerEnter: run, onTouchStart: run };
}

// Imperative variants for non-hook call sites (e.g. ⌘K result mapping).
export function prefetchHref(href: string): void { warm(preloadKeysFor(href)); }
export function prefetchSymbol(symbol: string): void { warm(symbolPreloadKeys(symbol)); }
