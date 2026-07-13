// ENRICH3 — the authorization decision for a watchlist-enrich request, split out
// pure so the "non-admin force → 403" rule is unit-testable without the Next
// request/response machinery.
//
// Policy: users CONSUME AI output; only schedules, staleness, and admins TRIGGER
// generation. So a force (manual Re-analyze) is admin-only; a non-admin force is
// rejected outright (403) rather than silently downgraded, so the client can never
// believe it forced a refresh that didn't happen.

export type EnrichDecision =
  | { kind: "forbidden" }              // non-admin tried to force → 403
  | { kind: "force" }                  // admin force → regenerate unconditionally
  | { kind: "auto" };                  // normal path → regenerate only if cache stale

export function decideEnrich(wantsForce: boolean, isAdmin: boolean): EnrichDecision {
  if (wantsForce && !isAdmin) return { kind: "forbidden" };
  if (wantsForce && isAdmin) return { kind: "force" };
  return { kind: "auto" };
}
