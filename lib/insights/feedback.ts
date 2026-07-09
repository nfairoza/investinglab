import type { StoredInsight } from "./types";

// =============================================================================
// Stage-4 feedback + precise governor state (pure). Both live in user_prefs.prefs
// so no new migration is needed:
//   insightFeedback: { [kind]: { mutedUntil: ISO|null, notForMeCount: number } }
//   insightSurfaced: { date: "YYYY-MM-DD", ids: string[] }
//
// "Not for me" mutes the KIND for 90 days AND downweights its ordering
// thereafter (repeated dismissals push a kind further down). The surfaced ledger
// records the exact insight ids shown today, so the daily governor counts real
// distinct surfacings — idempotent across SWR revalidations, not a createdAt
// proxy.
// =============================================================================

export const MUTE_DAYS = 90;

export interface KindFeedback { mutedUntil: string | null; notForMeCount: number }
export type InsightFeedback = Record<string, KindFeedback>;
export interface SurfacedLedger { date: string; ids: string[] }

const dayKey = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10);

// Record a "not for me" for a kind: extend the 90-day mute + bump the count.
export function recordNotForMe(fb: InsightFeedback, kind: string, nowMs: number): InsightFeedback {
  const prev = fb[kind] ?? { mutedUntil: null, notForMeCount: 0 };
  return {
    ...fb,
    [kind]: {
      mutedUntil: new Date(nowMs + MUTE_DAYS * 86_400_000).toISOString(),
      notForMeCount: prev.notForMeCount + 1,
    },
  };
}

// Is a kind currently muted (within its 90-day window)?
export function isKindMuted(fb: InsightFeedback, kind: string, nowMs: number): boolean {
  const f = fb[kind];
  return Boolean(f?.mutedUntil && Date.parse(f.mutedUntil) > nowMs);
}

// Ordering downweight for a kind: each past "not for me" (even after the mute
// lapses) pushes the kind's rank down. Returned as a penalty subtracted from the
// sort score. Capped so it never fully buries a severity-3 safety insight.
export function downweight(fb: InsightFeedback, kind: string): number {
  const n = fb[kind]?.notForMeCount ?? 0;
  return Math.min(n, 5); // 0..5 ranking penalty
}

// Rank with feedback-aware downweight. Severity dominates; among equal severity,
// impact/yr minus the kind's downweight-scaled penalty decides order.
export function rankWithFeedback(insights: StoredInsight[], fb: InsightFeedback): StoredInsight[] {
  const score = (i: StoredInsight) => {
    const penalty = downweight(fb, i.kind);
    // Penalty is expressed in "severity-equivalent" small steps so a heavily
    // down-voted kind sinks below its peers without crossing severity tiers.
    return i.severity * 1_000_000 + (i.impactPerYear ?? 0) - penalty * 100_000;
  };
  return insights.slice().sort((a, b) =>
    score(b) - score(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

// Merge today's newly-surfaced ids into the ledger (resets on a new day).
export function recordSurfaced(ledger: SurfacedLedger | null, ids: string[], nowMs: number): SurfacedLedger {
  const today = dayKey(nowMs);
  const base = ledger && ledger.date === today ? ledger.ids : [];
  return { date: today, ids: Array.from(new Set([...base, ...ids])) };
}

// How many distinct insights were surfaced today (0 on a new day).
export function surfacedToday(ledger: SurfacedLedger | null, nowMs: number): number {
  if (!ledger || ledger.date !== dayKey(nowMs)) return 0;
  return ledger.ids.length;
}

// Ids already surfaced today (so re-counting the same insight is idempotent).
export function surfacedIdsToday(ledger: SurfacedLedger | null, nowMs: number): Set<string> {
  if (!ledger || ledger.date !== dayKey(nowMs)) return new Set();
  return new Set(ledger.ids);
}
