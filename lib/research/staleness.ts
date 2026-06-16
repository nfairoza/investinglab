// Staleness policy for cached research memos. This is pure + dependency-free so
// it's trivial to unit-test and is the single source of truth for "is this memo
// old enough to nudge a refresh?". The API route and the UI both import from here.

// A memo older than this is considered stale and the UI shows a "refresh?" nudge.
// Analysis is expensive (LLM + several data pulls), so we DON'T auto-regenerate —
// we just flag staleness and let the user (or a slow scheduled job) refresh.
export const RESEARCH_STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface Freshness {
  ageMs: number;
  stale: boolean;
  label: string; // human-readable, e.g. "2 hours ago" / "just now"
}

export function ageMs(iso: string | null, now: number = Date.now()): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Infinity : Math.max(0, now - t);
}

export function isStale(iso: string | null, now: number = Date.now()): boolean {
  return ageMs(iso, now) >= RESEARCH_STALE_AFTER_MS;
}

// "just now" / "5 minutes ago" / "3 hours ago" / "2 days ago"
export function relativeLabel(iso: string | null, now: number = Date.now()): string {
  const ms = ageMs(iso, now);
  if (!Number.isFinite(ms)) return "unknown";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function freshness(iso: string | null, now: number = Date.now()): Freshness {
  const ms = ageMs(iso, now);
  return {
    ageMs: ms,
    stale: ms >= RESEARCH_STALE_AFTER_MS,
    label: relativeLabel(iso, now),
  };
}
