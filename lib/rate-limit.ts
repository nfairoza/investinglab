import { serviceClient } from "@/lib/service-client";
import { NextResponse } from "next/server";

// Per-user sliding-window rate limiter (P2). In-memory primary with a best-effort
// DB fallback so a serverless instance that just cold-started still sees recent
// usage from the shared rate_limits table. Admins are exempt at the call site.
//
// Window semantics: at most `limit` hits per `windowMs` per (userId, bucket).

interface Hit { at: number }
const mem = new Map<string, Hit[]>();

export interface RateResult { ok: boolean; remaining: number; retryAfterSec: number }

// Check-and-consume one unit. Returns ok=false with retryAfterSec when exceeded.
export async function rateLimit(
  bucket: string,
  userId: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const cutoff = now - windowMs;

  // L1: in-memory window.
  let hits = (mem.get(key) ?? []).filter((h) => h.at > cutoff);

  // L2: on a cold instance with no memory, seed from the DB so limits hold
  // across instances. Best-effort — never block the request path on DB errors.
  if (hits.length === 0) {
    const db = serviceClient();
    if (db) {
      try {
        const { data } = await db
          .from("rate_limits")
          .select("hits")
          .eq("key", key)
          .maybeSingle();
        const stored: number[] = ((data as any)?.hits ?? []).filter((t: number) => t > cutoff);
        if (stored.length) hits = stored.map((at) => ({ at }));
      } catch { /* ignore */ }
    }
  }

  if (hits.length >= limit) {
    const oldest = Math.min(...hits.map((h) => h.at));
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  hits.push({ at: now });
  mem.set(key, hits);

  // Persist the window (fire-and-forget).
  const db = serviceClient();
  if (db) {
    db.from("rate_limits")
      .upsert({ key, hits: hits.map((h) => h.at), updated_at: new Date().toISOString() }, { onConflict: "key" })
      .then(() => {}, () => {});
  }

  return { ok: true, remaining: limit - hits.length, retryAfterSec: 0 };
}

// Default AI-call budget: 20 calls / 5 min / user. Admins pass isAdmin=true to
// bypass. Returns a 429 NextResponse when exceeded, else null (proceed).
export async function guardAiRate(
  ctx: { userId: string; isAdmin: boolean },
  bucket = "ai",
  limit = 20,
  windowMs = 5 * 60 * 1000,
): Promise<NextResponse | null> {
  if (ctx.isAdmin) return null;
  const r = await rateLimit(bucket, ctx.userId, limit, windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: "rate_limited", message: `You're doing that a lot — please wait ${r.retryAfterSec}s and try again.` },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}
