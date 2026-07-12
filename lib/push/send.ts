import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// =============================================================================
// M1.2 — web push delivery. Sends a notification to all of a user's web push
// subscriptions via VAPID. Degrades gracefully: if VAPID keys aren't configured
// the send is a no-op (returns 0), so the alert path never breaks. A 404/410
// from the push service means the subscription is dead → prune it.
// =============================================================================

let configured = false;
function ensureVapid(): boolean {
  if (configured) return true;
  const pub = process.env.WEB_PUSH_PUBLIC_KEY;
  const priv = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:alerts@rukmoney.com", pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;   // deep-link (e.g. /research?ticker=NVDA)
  tag?: string;   // collapse key
}

// Send to one user's web subscriptions. `db` may be service-role (cron) or
// user-scoped; queries are filtered by userId. Returns count sent.
export async function sendPushToUser(db: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapid()) return 0;
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, keys, platform").eq("user_id", userId).eq("platform", "web");
  if (!subs?.length) return 0;

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys } as any, body);
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) dead.push(s.id); // gone → prune
    }
  }));
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead).then(() => {}, () => {});
  return sent;
}
