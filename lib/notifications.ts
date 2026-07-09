import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// Notifications inbox helpers (F1). One general per-user inbox behind the bell.
// Push delivery lands with MOBILE_APP M1.2; today these are in-app only. Every
// notification payload carries a dedupeKey so a re-run of the detection cron
// can't create the same notification twice.
// =============================================================================

export interface NotificationPayload {
  title: string;
  body: string;
  deeplink: string;
  dedupeKey: string;
  [k: string]: unknown;
}

// Create a notification unless one with the same (user, kind, dedupeKey) already
// exists. `db` may be service-role (cron) or user-scoped — scope by userId either
// way. Returns true if a new row was written.
export async function createNotification(
  db: SupabaseClient,
  userId: string,
  kind: string,
  payload: NotificationPayload,
): Promise<boolean> {
  // Dedupe: look for an existing notification of this kind with the same key.
  const { data: existing } = await db
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("payload->>dedupeKey", payload.dedupeKey)
    .limit(1);
  if (existing && existing.length > 0) return false;

  const { error } = await db.from("notifications").insert({ user_id: userId, kind, payload });
  return !error;
}
