import type { StoredInsight } from "./types";
import { MAX_NEW_PER_DAY } from "./config";

// =============================================================================
// Ranking + frequency governor (pure, testable). The GET route uses this to
// decide what to actually SHOW. "Trust dies by a thousand nudges": at most
// MAX_NEW_PER_DAY brand-new insights surface per day — the rest stay queued
// (status stays 'new' but they're withheld from the response). Severity-3 is
// EXEMPT from the cap (safety issues always show). Already-seen insights don't
// count against the daily budget.
// =============================================================================

// Sort by severity desc, then impact/yr desc, then newest — the cross-domain
// triage order used by Home cards and the archive default.
export function rankInsights(insights: StoredInsight[]): StoredInsight[] {
  return insights.slice().sort((a, b) =>
    b.severity - a.severity ||
    (b.impactPerYear ?? 0) - (a.impactPerYear ?? 0) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

// Apply the daily governor. `shownNewToday` = count of 'new' insights already
// surfaced to the user today (tracked by the caller). Returns the subset allowed
// to surface now, newest-first within the ranking. Dismissed/muted are already
// filtered by the caller's query.
export function applyGovernor(
  ranked: StoredInsight[],
  shownNewToday: number,
  nowMs: number = Date.now(),
): StoredInsight[] {
  let budget = Math.max(0, MAX_NEW_PER_DAY - shownNewToday);
  const out: StoredInsight[] = [];
  for (const ins of ranked) {
    if (ins.severity === 3) { out.push(ins); continue; }  // sev-3 exempt
    if (ins.status !== "new") { out.push(ins); continue; } // already surfaced before
    if (budget > 0) { out.push(ins); budget--; }
    // else: withheld this day (stays 'new' for a later day)
  }
  return out;
}

// Precise governor: `alreadySurfaced` are the ids counted against today's budget
// already (from the surfaced ledger). A 'new' insight already in that set is
// FREE to keep showing (it was surfaced earlier today — showing it again isn't a
// new nudge). Only 'new' ids NOT yet surfaced consume the remaining budget.
// Returns the visible subset AND the fresh ids that consumed budget (so the
// caller can persist them). Severity-3 always shows and never consumes budget.
export function applyGovernorPrecise(
  ranked: StoredInsight[],
  alreadySurfaced: Set<string>,
  nowMs: number = Date.now(),
): { visible: StoredInsight[]; newlySurfaced: string[] } {
  let budget = Math.max(0, MAX_NEW_PER_DAY - alreadySurfaced.size);
  const visible: StoredInsight[] = [];
  const newlySurfaced: string[] = [];
  for (const ins of ranked) {
    if (ins.severity === 3) { visible.push(ins); continue; }
    if (ins.status !== "new") { visible.push(ins); continue; }
    if (alreadySurfaced.has(ins.id)) { visible.push(ins); continue; } // already counted today
    if (budget > 0) { visible.push(ins); newlySurfaced.push(ins.id); budget--; }
    // else withheld until tomorrow
  }
  return { visible, newlySurfaced };
}

// Top-N for the Home cross-domain cards (already-ranked input).
export function topForHome(ranked: StoredInsight[], n = 2): StoredInsight[] {
  return ranked.filter((i) => i.status === "new" || i.status === "seen").slice(0, n);
}
