// SMOOTH S1 — single source of truth for "what to warm before the click".
//
// Sits next to lib/nav.ts (same single-source rule): the sidebar, mobile tab bar,
// section sub-nav, and ⌘K palette all read THIS map so prefetch targets can never
// drift from the routes themselves.
//
// GUARDRAIL 2 (hard): every key listed here MUST be a cache-/snapshot-backed
// endpoint that CANNOT fall through to a live FMP or Plaid call on a cold cache. A
// hover is a hint, not an intent — it must never spend API budget. That's why:
//   - /api/overview and /api/income are deliberately ABSENT: they call
//     marketData.getQuotes, which does a live FMP request on a cache miss.
//   - Plaid transactions are prefetched with ?sync=0 (skip the live Plaid sync);
//     accounts are snapshot-first by default.
// If you add a route here, confirm its GET reads only server_cache / a Postgres
// snapshot / the app DB — never a provider SDK — before listing it.

// Destination pathname → the primary SWR keys its landing view reads first.
// Keys are matched EXACTLY to the useSWR keys the page mounts with, so a warmed
// key produces a zero-skeleton cache-first render (see S2).
export const ROUTE_PRELOADS: Record<string, string[]> = {
  // Portfolio section
  "/holdings": ["/api/holdings"],
  "/watchlist": ["/api/watchlist"],
  // /income intentionally omitted (live FMP quotes on cold cache).

  // Money section — the real keys money-dashboard mounts (NOT /api/overview).
  "/money": ["/api/plaid/accounts", "/api/plaid/transactions?sync=0", "/api/networth"],
  "/accounts": ["/api/plaid/accounts"],
  "/transactions": ["/api/plaid/transactions?sync=0"],
  "/networth": ["/api/networth"],
  "/insights": ["/api/insights"],

  // Home (/) omitted: /api/overview can trigger live quotes on a cold cache.
};

// Keys to warm for a specific symbol's research/detail page. Quote reads the 60s
// FMP cache; profile the 7d L2 durable cache. These go THROUGH the FMP cache layer
// (not a raw provider call), but on a cold cache they can fall through to FMP — so
// per guardrail 2 they're only "net-zero" because (a) the destination page makes
// these exact calls on click anyway, (b) SWR dedupes within 15s, and (c) usePrefetch
// throttles to once/30s/key. A hover that becomes a click = the same single call;
// a hover that doesn't is capped at one warm per 30s. The heavy AI research memo is
// NEVER prefetched (generated on demand, rate-guarded).
export function symbolPreloadKeys(symbol: string): string[] {
  const s = encodeURIComponent(symbol.toUpperCase());
  return [`/api/quote?symbol=${s}`, `/api/profile?symbol=${s}`];
}

// The preload keys for a destination href, or [] if nothing is safe to warm.
// Exact-match on the pathname (query-string hrefs are handled by symbolPreloadKeys).
export function preloadKeysFor(href: string): string[] {
  const path = href.split("?")[0];
  return ROUTE_PRELOADS[path] ?? [];
}
