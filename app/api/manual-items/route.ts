import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { computeNetWorth, currentMonth } from "@/lib/networth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ASSET_TYPES = ["cash", "investment", "retirement", "real_estate", "vehicle", "other_asset"];
const LIABILITY_TYPES = ["credit_card", "mortgage", "loan", "other_liability"];

// After any manual-item change, recompute + rewrite the current month snapshot
// so the trend + totals reflect it immediately.
async function recomputeSnapshot(ctx: { supabase: SupabaseClient; userId: string }) {
  try {
    const nw = await computeNetWorth(ctx);
    await ctx.supabase.from("net_worth_snapshots").upsert(
      {
        user_id: ctx.userId, month: currentMonth(),
        total_assets: nw.totalAssets, total_liabilities: nw.totalLiabilities, net_worth: nw.netWorth,
        by_type: { ...nw.byType, __hash: nw.sourceHash }, captured_at: new Date().toISOString(),
      },
      { onConflict: "user_id,month" },
    );
  } catch { /* best-effort */ }
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("manual_items").select("*").order("created_at", { ascending: true });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name ?? "").trim();
  const kind = b?.kind === "liability" ? "liability" : "asset";
  const type = String(b?.type ?? "");
  const value = Number(b?.value);
  const validType = kind === "asset" ? ASSET_TYPES.includes(type) : LIABILITY_TYPES.includes(type);
  if (!name || !validType || !Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: "name, valid type, and non-negative value required" }, { status: 400 });
  }
  await ctx.supabase.from("manual_items").insert({ user_id: ctx.userId, name, kind, type, value, notes: b?.notes ?? null });
  await recomputeSnapshot(ctx);
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof b.name === "string") patch.name = b.name.trim();
  if (b.value != null && Number.isFinite(Number(b.value))) patch.value = Number(b.value);
  if (typeof b.notes === "string") patch.notes = b.notes;
  await ctx.supabase.from("manual_items").update(patch).eq("id", id);
  await recomputeSnapshot(ctx);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("manual_items").delete().eq("id", id);
  await recomputeSnapshot(ctx);
  return NextResponse.json({ ok: true });
}
