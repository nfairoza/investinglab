// F2 — Resend email delivery. Thin fetch wrapper (no SDK dependency). Degrades
// gracefully: if RESEND_API_KEY is unset, returns { sent:false, reason } so the
// digest run still records an in-app notification instead of throwing.

export interface SendResult { sent: boolean; reason?: string }

export async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not configured" };
  const from = process.env.DIGEST_FROM || "digest@rukmoney.com";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { sent: false, reason: `Resend HTTP ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}
