import { serviceClient } from "@/lib/service-client";
import { writeServerCache } from "@/lib/server-cache";
import { createNotification } from "@/lib/notifications";
import { assembleDigest, hasContent } from "./assemble";
import { renderDigestHtml, renderDigestText } from "./render";

// =============================================================================
// F2 — weekly digest run. For each opted-in user: assemble → render → email via
// Resend (graceful) + always drop an in-app notification. Store the rendered
// HTML in server_cache so "View last digest" works. Cross-user, service-role.
// =============================================================================

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://rukmoney.com";

export interface DigestRunResult { eligible: number; emailed: number; inApp: number; skippedEmpty: number }

export async function runWeeklyDigest(nowMs = Date.now()): Promise<DigestRunResult> {
  const db = serviceClient();
  if (!db) return { eligible: 0, emailed: 0, inApp: 0, skippedEmpty: 0 };

  // Opt-in lives in user_prefs.prefs.digestPrefs.weekly (default true). We read
  // all prefs rows and treat missing as opted-in (habit-forming default), but a
  // user who explicitly set weekly:false is excluded.
  const { data: prefRows } = await db.from("user_prefs").select("user_id, prefs");
  const optedIn = (prefRows ?? []).filter((r: any) => {
    const dp = (r.prefs as any)?.digestPrefs;
    return !dp || dp.weekly !== false;
  });

  // Resolve each user's email from AUTH (auth.users.email) — it is NOT stored in
  // user_prefs. Batch-fetch once via the admin API, then map user_id → email.
  // (A prefs.email override, if ever set, still wins.)
  const emailById = new Map<string, string>();
  try {
    let page = 1;
    for (;;) {
      const { data: list } = await (db as any).auth.admin.listUsers({ page, perPage: 1000 });
      const users = list?.users ?? [];
      for (const u of users) if (u.email) emailById.set(u.id, u.email);
      if (users.length < 1000) break;
      page++;
    }
  } catch { /* fall back to prefs.email per-user below */ }

  let emailed = 0, inApp = 0, skippedEmpty = 0;
  for (const row of optedIn) {
    const userId = String((row as any).user_id);
    try {
      const data = await assembleDigest(db, userId, nowMs);
      if (!hasContent(data)) { skippedEmpty++; continue; }

      const prefs = (row as any).prefs ?? {};
      const firstName = typeof prefs.displayName === "string" ? prefs.displayName.split(" ")[0] : undefined;
      const html = renderDigestHtml(data, {
        firstName,
        unsubscribeUrl: `${APP_URL}/settings?unsub=digest`,
        appUrl: APP_URL,
      });
      const text = renderDigestText(data);

      // Store rendered digest for "View last digest".
      await writeServerCache(`digest:last:${userId}`, { html, at: data.generatedAt }).catch(() => {});

      // Email (best-effort). Prefer the auth email; a prefs.email override wins if set.
      const email = (typeof prefs.email === "string" && prefs.email) || emailById.get(userId) || null;
      if (email) {
        const r = await sendEmailSafe(email, html, text);
        if (r) emailed++;
      }

      // Always drop an in-app notification linking to the stored digest.
      if (await createNotification(db, userId, "digest", {
        title: "Your weekly digest is ready",
        body: data.insight ?? "Your week in review — net worth, movers, and people you follow.",
        deeplink: "/insights?digest=last",
        dedupeKey: `digest:${new Date(nowMs).toISOString().slice(0, 10)}`,
      })) inApp++;
    } catch { /* skip a failing user */ }
  }

  return { eligible: optedIn.length, emailed, inApp, skippedEmpty };
}

async function sendEmailSafe(to: string, html: string, text: string): Promise<boolean> {
  const { sendEmail } = await import("./resend");
  const r = await sendEmail({ to, subject: "Your rukMoney weekly digest", html, text });
  return r.sent;
}
