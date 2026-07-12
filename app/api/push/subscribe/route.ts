import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET — the VAPID public key the client needs to subscribe (safe to expose).
export async function GET() {
  return NextResponse.json({ publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null });
}

// POST — store a web push subscription for the current user (idempotent on endpoint).
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
    platform: z.enum(["web", "ios", "android"]).default("web"),
  }));
  if (!parsed.ok) return parsed.response;
  const { endpoint, keys, platform } = parsed.data;
  const { error } = await ctx.supabase.from("push_subscriptions").upsert(
    { user_id: ctx.userId, endpoint, keys, platform },
    { onConflict: "user_id,endpoint" },
  );
  if (error) return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a subscription (?endpoint=...) or all of this user's.
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const endpoint = req.nextUrl.searchParams.get("endpoint");
  let q = ctx.supabase.from("push_subscriptions").delete().eq("user_id", ctx.userId);
  if (endpoint) q = q.eq("endpoint", endpoint);
  await q;
  return NextResponse.json({ ok: true });
}
