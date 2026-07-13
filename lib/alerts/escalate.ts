import { serviceClient } from "@/lib/service-client";
import { sendAlertEmail, resolveUserEmail, type AlertEmailItem } from "@/lib/alerts/email";

// ALERTDEL AD3 — the fallback. Finds severity-1 deliveries whose push has gone
// UNSEEN for 2+ hours (and no email yet), groups them per user into ONE batched
// "things you may have missed" email, and marks them escalated. Idempotent: a
// delivery is escalated at most once (email_sent_at guard + we stamp it here).
//
// Restraint by design: escalate by silence (2h unseen), batch never spam (one
// email per user per run regardless of count), and honor the per-user
// "email me about missed alerts" toggle (default ON).

const UNSEEN_ESCALATE_MS = 2 * 60 * 60 * 1000;

export interface EscalateResult { candidates: number; users: number; emailed: number }

interface DeliveryRow {
  id: string; user_id: string; payload: { title?: string; body?: string; url?: string } | null;
}

export async function runAlertEscalation(nowMs = Date.now()): Promise<EscalateResult> {
  const db = serviceClient();
  if (!db) return { candidates: 0, users: 0, emailed: 0 };

  const cutoff = new Date(nowMs - UNSEEN_ESCALATE_MS).toISOString();

  // Severity-1, pushed 2h+ ago, still unseen, not yet emailed.
  const { data: rows } = await db
    .from("alert_deliveries")
    .select("id, user_id, payload")
    .eq("severity", 1)
    .is("push_seen_at", null)
    .is("email_sent_at", null)
    .not("push_sent_at", "is", null)
    .lte("push_sent_at", cutoff);

  const deliveries = (rows ?? []) as DeliveryRow[];
  if (deliveries.length === 0) return { candidates: 0, users: 0, emailed: 0 };

  // Group per user.
  const byUser = new Map<string, DeliveryRow[]>();
  for (const d of deliveries) {
    const arr = byUser.get(d.user_id) ?? [];
    arr.push(d);
    byUser.set(d.user_id, arr);
  }

  let emailed = 0;
  for (const [userId, userDeliveries] of byUser) {
    // Respect the per-user "email me about missed alerts" toggle (default ON).
    if (!(await wantsMissedAlertEmail(db, userId))) {
      // Toggle OFF → never escalate; still stamp email_sent_at so we don't re-scan
      // these forever. Mark them "suppressed" in outcomes for /admin clarity.
      await stampEscalated(db, userDeliveries.map((d) => d.id), "skip:opted_out");
      continue;
    }

    const email = await resolveUserEmail(db, userId).catch(() => null);
    if (!email) {
      await stampEscalated(db, userDeliveries.map((d) => d.id), "skip:no_email");
      continue;
    }

    const items: AlertEmailItem[] = userDeliveries.map((d) => ({
      title: d.payload?.title ?? "Alert",
      body: d.payload?.body ?? "",
      url: d.payload?.url,
    }));
    const r = await sendAlertEmail(email, items, { critical: false }).catch((e) => ({ sent: false, reason: e instanceof Error ? e.message : "fail" }));
    // Mark escalated regardless of send outcome so a hard failure doesn't loop
    // forever; the outcome is recorded for /admin.
    await stampEscalated(db, userDeliveries.map((d) => d.id), r.sent ? "ok" : `fail:${(r.reason ?? "").slice(0, 80)}`);
    if (r.sent) emailed++;
  }

  return { candidates: deliveries.length, users: byUser.size, emailed };
}

async function wantsMissedAlertEmail(db: NonNullable<ReturnType<typeof serviceClient>>, userId: string): Promise<boolean> {
  try {
    const { data } = await db.from("user_prefs").select("prefs").eq("user_id", userId).maybeSingle();
    const v = (data?.prefs as { notifyPrefs?: { missedAlertEmail?: boolean } } | undefined)?.notifyPrefs?.missedAlertEmail;
    return v !== false; // default ON
  } catch {
    return true; // default ON on read failure
  }
}

async function stampEscalated(db: NonNullable<ReturnType<typeof serviceClient>>, ids: string[], emailOutcome: string): Promise<void> {
  if (!ids.length) return;
  const emailSentAt = new Date().toISOString();
  // Merge the escalation outcome into each row's existing outcomes (preserving the
  // push/email outcomes recorded at delivery time) so /admin sees the full picture.
  const { data: existing } = await db.from("alert_deliveries").select("id, outcomes").in("id", ids);
  await Promise.all((existing ?? []).map((row: { id: string; outcomes: Record<string, unknown> | null }) =>
    db.from("alert_deliveries")
      .update({ email_sent_at: emailSentAt, outcomes: { ...(row.outcomes ?? {}), escalation: emailOutcome } })
      .eq("id", row.id)
      .then(() => {}, () => {}),
  ));
}
