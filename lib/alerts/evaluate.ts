import type { Alert } from "@/lib/db";

// Live data needed to evaluate any alert for a symbol.
export interface AlertContext {
  price: number | null;
  changePct: number | null;     // today's % move
  earningsInDays: number | null;
  score: number | null;         // 0..100 rules-based score
}

export interface AlertEval {
  triggered: boolean;
  value: number; // the metric value that was checked (for the feed / lastValue)
}

// Pure condition check. Returns null when the data needed isn't available yet
// (so we neither trigger nor clear — just skip this round).
export function evaluateAlert(a: Alert, ctx: AlertContext): AlertEval | null {
  switch (a.type) {
    case "price": {
      if (ctx.price == null || a.price == null) return null;
      const triggered = a.direction === "below" ? ctx.price <= a.price : ctx.price >= a.price;
      return { triggered, value: ctx.price };
    }
    case "dayMove": {
      if (ctx.changePct == null || a.movePct == null) return null;
      return { triggered: Math.abs(ctx.changePct) >= a.movePct, value: ctx.changePct };
    }
    case "earnings": {
      if (ctx.earningsInDays == null || a.withinDays == null) return null;
      // Only count upcoming earnings (>= 0); -1 etc. means none scheduled.
      const triggered = ctx.earningsInDays >= 0 && ctx.earningsInDays <= a.withinDays;
      return { triggered, value: ctx.earningsInDays };
    }
    case "score": {
      if (ctx.score == null || a.scoreValue == null) return null;
      const triggered = a.scoreOp === "above" ? ctx.score >= a.scoreValue : ctx.score <= a.scoreValue;
      return { triggered, value: ctx.score };
    }
  }
}

// Human-readable one-liner describing the condition (for the alerts list row).
export function describeAlert(a: Alert): string {
  switch (a.type) {
    case "price":
      return `Price ${a.direction === "below" ? "≤" : "≥"} $${a.price?.toFixed(2) ?? "—"}`;
    case "dayMove":
      return `Day move ≥ ±${a.movePct ?? "—"}%`;
    case "earnings":
      return `Earnings within ${a.withinDays ?? "—"} day${a.withinDays === 1 ? "" : "s"}`;
    case "score":
      return `Score ${a.scoreOp === "above" ? "≥" : "≤"} ${a.scoreValue ?? "—"}`;
  }
}

// Format the tripped value for display in the feed.
export function formatTriggerValue(a: Alert, value: number): string {
  switch (a.type) {
    case "price": return `$${value.toFixed(2)}`;
    case "dayMove": return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
    case "earnings": return `${value} day${value === 1 ? "" : "s"} out`;
    case "score": return `score ${Math.round(value)}`;
  }
}

// Does this alert type need the (heavier) /api/score fetch?
export function needsScore(a: Alert): boolean {
  return a.type === "earnings" || a.type === "score";
}

// ── Time-bound alerts ─────────────────────────────────────────────────────────
// An alert with no expiresAt is persistent. One with expiresAt is "time-bound"
// and should stop existing once that moment passes.
export function isExpired(a: Pick<Alert, "expiresAt">, nowMs: number = Date.now()): boolean {
  return !!a.expiresAt && new Date(a.expiresAt).getTime() <= nowMs;
}

// Short, human-friendly description of when an alert lapses, e.g. "expires in 3d"
// or "expires Jun 30, 5:00 PM". Returns null for persistent alerts.
export function describeExpiry(a: Pick<Alert, "expiresAt">, nowMs: number = Date.now()): string | null {
  if (!a.expiresAt) return null;
  const t = new Date(a.expiresAt).getTime();
  if (!Number.isFinite(t)) return null;
  const ms = t - nowMs;
  if (ms <= 0) return "expired";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `expires in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `expires in ${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days <= 14) return `expires in ${days}d`;
  return `expires ${new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
