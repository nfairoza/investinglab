import { serviceClient } from "@/lib/service-client";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { withFmpFeature } from "@/lib/providers/fmp";
import { evaluateAlert, describeAlert, formatTriggerValue, type AlertContext } from "@/lib/alerts/evaluate";
import { recordDelivery } from "@/lib/alerts/delivery";
import type { Alert } from "@/lib/db";

// =============================================================================
// Server-side alert evaluation — runs on the cron so alerts fire even when the
// app is CLOSED. Cross-user, via the service-role client (bypasses RLS).
//
// The "notification sink" is the alert row itself: we write last_triggered_at /
// last_value / trigger_count, which the client already renders as the
// "Recently triggered" feed. (Desktop push stays client-only — no web-push infra
// here; this makes triggers durable so the user sees them on next open.)
//
// Budget: ONE batch-quote call covers every unique symbol across all users'
// price + dayMove alerts. Earnings/score alerts need per-symbol /score, which is
// too expensive to run for every user on a 5-min cron — those keep evaluating
// client-side (documented). withFmpFeature tags calls as "alerts" in the health
// strip. Re-arm matches the client (6h) so cron + client don't double-fire.
// =============================================================================

const REARM_MS = 6 * 60 * 60 * 1000;

interface AlertRow {
  id: string; user_id: string; symbol: string; type: Alert["type"];
  direction: Alert["direction"] | null; price: number | null; move_pct: number | null;
  within_days: number | null; score_op: Alert["scoreOp"] | null; score_value: number | null;
  enabled: boolean; expires_at: string | null; last_triggered_at: string | null;
  last_value: number | null; trigger_count: number | null;
  critical: boolean | null; // ALERTDEL — user-marked critical → severity 3 (push + email now)
}

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id, symbol: r.symbol, type: r.type,
    direction: r.direction ?? undefined, price: r.price ?? undefined, movePct: r.move_pct ?? undefined,
    withinDays: r.within_days ?? undefined, scoreOp: r.score_op ?? undefined, scoreValue: r.score_value ?? undefined,
    enabled: r.enabled, critical: r.critical ?? false, expiresAt: r.expires_at ?? undefined,
    lastTriggeredAt: r.last_triggered_at ?? undefined, lastValue: r.last_value ?? undefined,
    triggerCount: r.trigger_count ?? 0, createdAt: "", updatedAt: "",
  };
}

export interface AlertRunResult { evaluated: number; symbols: number; triggered: number; pruned: number; skippedTypes: number }

export async function runAlerts(nowMs = Date.now()): Promise<AlertRunResult> {
  const db = serviceClient();
  if (!db) return { evaluated: 0, symbols: 0, triggered: 0, pruned: 0, skippedTypes: 0 };

  const nowIso = new Date(nowMs).toISOString();

  // Prune expired alerts across all users (server-authoritative cleanup).
  let pruned = 0;
  try {
    const { data } = await db.from("alerts").delete().not("expires_at", "is", null).lt("expires_at", nowIso).select("id");
    pruned = data?.length ?? 0;
  } catch { /* best-effort */ }

  // All enabled, non-expired alerts across every user.
  const { data: rows } = await db.from("alerts").select("*").eq("enabled", true);
  const alerts = (rows ?? [])
    .map((r) => ({ row: r as AlertRow, a: toAlert(r as AlertRow) }))
    .filter(({ a }) => !a.expiresAt || new Date(a.expiresAt).getTime() > nowMs);

  // Only price + dayMove are evaluated server-side (quote-only). earnings/score
  // need per-symbol /score — too costly on a cron; they stay client-side.
  const serverEval = alerts.filter(({ a }) => a.type === "price" || a.type === "dayMove");
  const skippedTypes = alerts.length - serverEval.length;
  if (serverEval.length === 0) return { evaluated: 0, symbols: 0, triggered: 0, pruned, skippedTypes };

  const symbols = Array.from(new Set(serverEval.map(({ a }) => a.symbol.toUpperCase())));
  const quotes: Record<string, DataResult<Quote>> = await withFmpFeature("alerts",
    () => marketData.getQuotes(symbols).catch(() => ({} as Record<string, DataResult<Quote>>)));

  let triggered = 0;
  for (const { row, a } of serverEval) {
    const q = quotes[a.symbol.toUpperCase()]?.data ?? null;
    const ctx: AlertContext = { price: q?.price ?? null, changePct: q?.changePct ?? null, earningsInDays: null, score: null };
    const res = evaluateAlert(a, ctx);
    if (!res || !res.triggered) continue;
    // Re-arm: don't refire within 6h of the last trigger (matches the client).
    const recently = row.last_triggered_at ? nowMs - new Date(row.last_triggered_at).getTime() < REARM_MS : false;
    if (recently) continue;
    try {
      await db.from("alerts").update({
        last_triggered_at: nowIso,
        last_value: res.value,
        trigger_count: (row.trigger_count ?? 0) + 1,
        updated_at: nowIso,
      }).eq("id", row.id);
      triggered++;
      // ALERTDEL AD4: one delivery pipeline. recordDelivery writes the in-app feed
      // row + the delivery ledger, sends push, and (only for critical/severity-3)
      // emails immediately. Severity-1 escalation is handled by the alert-escalate
      // cron, not here. Best-effort — a delivery failure never aborts the run.
      const title = `${a.symbol} alert`;
      const body = `${describeAlert(a)} — now ${formatTriggerValue(a, res.value)}`;
      void recordDelivery(db, {
        alertId: row.id,
        userId: row.user_id,
        severity: row.critical ? 3 : 1,
        kind: "alert",
        title,
        body,
        url: `/research?ticker=${encodeURIComponent(a.symbol)}`,
        // One delivery per trigger event — the alert id + the trigger timestamp.
        dedupeKey: `alert:${row.id}:${nowIso}`,
      }).catch(() => {});
    } catch { /* skip this row on write failure */ }
  }

  return { evaluated: serverEval.length, symbols: symbols.length, triggered, pruned, skippedTypes };
}
