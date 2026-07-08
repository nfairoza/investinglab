import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Per-user profile preferences, stored in user_prefs.prefs (RLS-scoped).
// Only these fields are accepted (allowlist), so a client can't write arbitrary keys.
const FIELDS = ["displayName", "phone", "baseCurrency", "beginnerMode", "nwRange", "setupDismissed", "askedRukmani"] as const;

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
    nwRange: prefs.nwRange ?? 12, // net-worth chart period (months; 0 = All)
    setupDismissed: prefs.setupDismissed ?? false, // user dismissed the setup checklist
    askedRukmani: prefs.askedRukmani ?? false,     // has asked the AI assistant at least once
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    displayName: z.string().optional(),
    phone: z.string().optional(),
    baseCurrency: z.string().optional(),
    beginnerMode: z.boolean().optional(),
    nwRange: z.number().optional(),
    setupDismissed: z.boolean().optional(),
    askedRukmani: z.boolean().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data } = await ctx.supabase.from("user_prefs").select("prefs").maybeSingle();
  const prefs = { ...((data?.prefs as Record<string, unknown>) ?? {}) };
  for (const f of FIELDS) {
    if (f in body) prefs[f] = (body as Record<string, unknown>)[f];
  }
  await ctx.supabase.from("user_prefs").upsert(
    { user_id: ctx.userId, prefs, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return NextResponse.json({ ok: true, prefs });
}
