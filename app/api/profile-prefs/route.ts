import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// Per-user profile preferences, stored in user_prefs.prefs (RLS-scoped).
// Only these fields are accepted (allowlist), so a client can't write arbitrary keys.
const FIELDS = ["displayName", "phone", "baseCurrency", "beginnerMode"] as const;

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("user_prefs").select("prefs").maybeSingle();
  const prefs = (data?.prefs as Record<string, unknown>) ?? {};
  return NextResponse.json({
    displayName: prefs.displayName ?? "",
    phone: prefs.phone ?? "",
    baseCurrency: prefs.baseCurrency ?? "USD",
    beginnerMode: prefs.beginnerMode ?? true,
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const { data } = await ctx.supabase.from("user_prefs").select("prefs").maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}) };
  for (const f of FIELDS) {
    if (f in body) prefs[f] = body[f];
  }
  await ctx.supabase.from("user_prefs").upsert(
    { user_id: ctx.userId, prefs, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return NextResponse.json({ ok: true, prefs });
}
