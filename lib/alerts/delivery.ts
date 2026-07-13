import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/send";
import { createNotification } from "@/lib/notifications";
import { sendAlertEmail } from "@/lib/alerts/email";
import { resolveUserEmail } from "@/lib/alerts/email";

// =============================================================================
// ALERTDEL — the ONE delivery pipeline. Every alert trigger (and any Insights-
// sourced delivery) flows through recordDelivery(), which guarantees:
//   1. in-app feed row (unconditional, immediate — the permanent record)
//   2. a delivery ledger row (alert_deliveries) carrying read-tracking + outcomes
//   3. web push if the user is subscribed
//   4. for SEVERITY 3 (critical): an immediate email too — both channels for the
//      moment it matters. Severity 1 (routine) never emails here; the
//      alert-escalate cron handles the 2h-unseen fallback.
// Severity-1 escalation lives in lib/alerts/escalate.ts, not here.
// =============================================================================

export interface DeliveryInput {
  alertId: string | null;   // null for non-alert deliveries (e.g. Insights)
  userId: string;
  severity: 1 | 3;          // 1 = routine (push only), 3 = critical (push + email now)
  kind: string;             // notification kind, e.g. "alert" | "insight"
  title: string;
  body: string;
  url: string;              // deep link (research/holdings/etc.)
  dedupeKey: string;        // in-app notification dedupe
}

export interface DeliveryOutcome {
  deliveryId: string | null;
  push: string;   // "ok" | "no_subs" | "fail:..." | "skip"
  email: string;  // "ok" | "skip" | "fail:..." | "n/a"
}

// Record + deliver one alert. `db` is service-role (cron) or user-scoped.
export async function recordDelivery(db: SupabaseClient, input: DeliveryInput): Promise<DeliveryOutcome> {
  const nowIso = new Date().toISOString();

  // (1) In-app feed — the unconditional permanent record. Deduped by dedupeKey.
  await createNotification(db, input.userId, input.kind, {
    title: input.title,
    body: input.body,
    deeplink: input.url,
    dedupeKey: input.dedupeKey,
  }).catch(() => {});

  // (2) Delivery ledger row FIRST, so the push payload can carry its id (for the
  // "mark seen on open" beacon). If the insert fails we still push (best-effort).
  let deliveryId: string | null = null;
  try {
    const { data } = await db.from("alert_deliveries").insert({
      alert_id: input.alertId,
      user_id: input.userId,
      severity: input.severity,
      triggered_at: nowIso,
      payload: { title: input.title, body: input.body, url: input.url },
    }).select("id").maybeSingle();
    deliveryId = (data as { id?: string } | null)?.id ?? null;
  } catch { /* ledger is best-effort; delivery still proceeds */ }

  // (3) Web push, carrying the delivery id so opening the notification marks it seen.
  let pushOutcome = "skip";
  let pushSentAt: string | null = null;
  try {
    const n = await sendPushToUser(db, input.userId, {
      title: input.title,
      body: input.body,
      url: input.url,
      tag: input.alertId ? `alert:${input.alertId}` : `delivery:${deliveryId ?? input.dedupeKey}`,
      deliveryId: deliveryId ?? undefined,
    });
    pushOutcome = n > 0 ? "ok" : "no_subs";
    if (n > 0) pushSentAt = new Date().toISOString();
  } catch (e) {
    pushOutcome = `fail:${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`;
  }

  // (4) Severity 3 → email immediately (same Resend path AD3 uses). No wait.
  let emailOutcome = "n/a";
  let emailSentAt: string | null = null;
  if (input.severity === 3) {
    const email = await resolveUserEmail(db, input.userId).catch(() => null);
    if (!email) {
      emailOutcome = "skip:no_email";
    } else {
      const r = await sendAlertEmail(email, [{ title: input.title, body: input.body, url: input.url }], { critical: true }).catch((e) => ({ sent: false, reason: e instanceof Error ? e.message : "fail" }));
      emailOutcome = r.sent ? "ok" : `fail:${(r.reason ?? "").slice(0, 80)}`;
      if (r.sent) emailSentAt = new Date().toISOString();
    }
  }

  // Stamp outcomes + timestamps on the ledger row for /admin debuggability.
  if (deliveryId) {
    await db.from("alert_deliveries").update({
      push_sent_at: pushSentAt,
      email_sent_at: emailSentAt,
      outcomes: { push: pushOutcome, email: emailOutcome },
    }).eq("id", deliveryId).then(() => {}, () => {});
  }

  return { deliveryId, push: pushOutcome, email: emailOutcome };
}
