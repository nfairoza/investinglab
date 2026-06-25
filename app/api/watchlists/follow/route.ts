import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { presetByKey } from "@/lib/screener/presets";

export const dynamic = "force-dynamic";

// POST /api/watchlists/follow { presetKey } — follow a trending list. Stores a
// reference (kind='followed' + preset_key); items are NOT copied — the list
// re-runs live when opened. Idempotent.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const presetKey = String(body?.presetKey ?? "");
  const preset = presetByKey(presetKey);
  if (!preset) return NextResponse.json({ error: "unknown preset" }, { status: 400 });

  const { data: existing } = await ctx.supabase
    .from("watch_lists").select("id").eq("preset_key", presetKey).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, id: existing.id, already: true });

  const { data, error } = await ctx.supabase
    .from("watch_lists").insert({ user_id: ctx.userId, name: preset.label, kind: "followed", preset_key: presetKey })
    .select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

// DELETE /api/watchlists/follow?presetKey= — unfollow.
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const presetKey = req.nextUrl.searchParams.get("presetKey");
  if (!presetKey) return NextResponse.json({ error: "presetKey required" }, { status: 400 });
  await ctx.supabase.from("watch_lists").delete().eq("preset_key", presetKey).eq("kind", "followed");
  return NextResponse.json({ ok: true });
}
