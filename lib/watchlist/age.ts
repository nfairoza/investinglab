// ENRICH2 — analysis-age helpers for the watchlist enrichment row.
//
// The "analysis age" is deliberately SEPARATE from the price asOf: the AI thinking
// (fair value, cases, catalyst) is cached ~daily, while the price it's compared
// against is live. The row shows both so a user never mistakes a day-old analysis
// for a live one. Pure + unit-tested (inject `now`).

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

// Amber past this many days: analysis auto-refreshes daily, so >3d means the
// automatic refresh hasn't fired for this symbol (not viewed, or the daily cap was
// hit) — a clear "this is getting old" signal, not an error.
export const ANALYSIS_STALE_DAYS = 3;

export interface AnalysisAge {
  label: string;      // "just now" | "5m ago" | "3h ago" | "2d ago"
  amber: boolean;     // true once older than ANALYSIS_STALE_DAYS
  ms: number;         // age in ms (Infinity when never analyzed)
}

// Human age of an analysis timestamp. Returns null when there's no analysis yet
// (caller shows nothing / the "Analyze" affordance instead).
export function analysisAge(analyzedAt: string | null | undefined, now: number = Date.now()): AnalysisAge | null {
  if (!analyzedAt) return null;
  const t = new Date(analyzedAt).getTime();
  if (Number.isNaN(t)) return null;
  const ms = Math.max(0, now - t);
  const amber = ms > ANALYSIS_STALE_DAYS * DAY_MS;

  let label: string;
  if (ms < MIN_MS) label = "just now";
  else if (ms < HOUR_MS) label = `${Math.floor(ms / MIN_MS)}m ago`;
  else if (ms < DAY_MS) label = `${Math.floor(ms / HOUR_MS)}h ago`;
  else label = `${Math.floor(ms / DAY_MS)}d ago`;

  return { label, amber, ms };
}

// True when a row's analysis has aged past the daily boundary (has prior content
// worth refreshing). `null`/never-analyzed is NOT "stale" — that's a distinct
// "never enriched" case handled by needsAutoEnrich below.
export function isAnalysisStale(analyzedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!analyzedAt) return false;
  const t = new Date(analyzedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > DAY_MS;
}

// Whether a row scrolled into view should fire the automatic background
// enrichment (ENRICH1). Fires when the row has NEVER been analyzed (so a
// newly-added ticker gets its first analysis without any manual button — the
// policy removes on-demand AI triggers for regular users) OR when the existing
// analysis is daily-stale. The server still gates on the shared cache
// (first-viewer-pays) + the per-day cap, so this being eager is safe.
export function needsAutoEnrich(analyzedAt: string | null | undefined, now: number = Date.now()): boolean {
  return !analyzedAt || isAnalysisStale(analyzedAt, now);
}
