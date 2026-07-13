import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/digest/resend";

// ALERTDEL — the ONE alert-email code path (shared by the severity-3 immediate
// send in delivery.ts and the batched escalation in escalate.ts). Reuses the
// digest's Resend client + dark-brand template shell; no second email pipeline.

export interface AlertEmailItem { title: string; body: string; url?: string }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://rukmoney.com";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Pure HTML render (testable) — mirrors the digest shell with a "missed alerts" /
// "critical alert" content block.
export function renderAlertEmailHtml(items: AlertEmailItem[], opts: { critical: boolean }): string {
  const heading = opts.critical
    ? "A critical alert just fired"
    : `${items.length} ${items.length === 1 ? "alert" : "alerts"} you may have missed`;
  const rows = items.map((it) => `
    <div style="background:#12151A;border:1px solid #1E242C;border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="color:#F7F8FA;font-weight:600;font-size:15px">${esc(it.title)}</div>
      <div style="color:#A9B2BD;font-size:13px;margin-top:4px">${esc(it.body)}</div>
    </div>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#0A0C0F;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:24px">
      <div style="font-size:22px;font-weight:800;letter-spacing:-1px;padding:8px 0"><span style="color:#F7F8FA">ruk</span><span style="color:#16D27E">Money</span></div>
      <div style="color:#A9B2BD;font-size:14px;margin-bottom:16px">${esc(heading)}.</div>
      ${rows}
      <a href="${APP_URL}/alerts" style="display:inline-block;margin-top:8px;background:#16D27E;color:#0A0C0F;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px">Open your alerts</a>
      <div style="color:#5B6673;font-size:11px;margin-top:24px;line-height:1.6">
        ${opts.critical ? "You marked this alert critical." : "We email you about alerts you may have missed after a couple of hours — you can turn this off in Settings → Notifications."}<br/>
        Research &amp; education, not financial advice.
      </div>
    </div></body></html>`;
}

export function renderAlertEmailText(items: AlertEmailItem[], opts: { critical: boolean }): string {
  const lines = [opts.critical ? "rukMoney — a critical alert fired" : "rukMoney — alerts you may have missed", ""];
  for (const it of items) lines.push(`• ${it.title} — ${it.body}`);
  lines.push("", `${APP_URL}/alerts`);
  return lines.join("\n");
}

export function alertEmailSubject(items: AlertEmailItem[], opts: { critical: boolean }): string {
  if (opts.critical) return `⚠ ${items[0]?.title ?? "Critical alert"}`;
  return items.length === 1
    ? `You may have missed: ${items[0].title}`
    : `${items.length} alerts you may have missed`;
}

// Send one alert email (immediate critical, or a batch of missed alerts).
export async function sendAlertEmail(
  to: string,
  items: AlertEmailItem[],
  opts: { critical: boolean },
): Promise<{ sent: boolean; reason?: string }> {
  if (!items.length) return { sent: false, reason: "no items" };
  return sendEmail({
    to,
    subject: alertEmailSubject(items, opts),
    html: renderAlertEmailHtml(items, opts),
    text: renderAlertEmailText(items, opts),
  });
}

// Resolve a user's email via the admin API (same source the digest uses). A
// user_prefs.prefs.email override wins if present.
export async function resolveUserEmail(db: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data: prefRow } = await db.from("user_prefs").select("prefs").eq("user_id", userId).maybeSingle();
    const prefEmail = (prefRow?.prefs as { email?: unknown } | undefined)?.email;
    if (typeof prefEmail === "string" && prefEmail.includes("@")) return prefEmail;
  } catch { /* fall through to auth lookup */ }
  try {
    const { data } = await (db as unknown as { auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string } | null } }> } } }).auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch { return null; }
}
