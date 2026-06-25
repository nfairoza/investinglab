import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { ensureDefaultList } from "@/lib/watchlists";
import type { WatchItem } from "@/lib/db";

export const dynamic = "force-dynamic";

// Back-compat shim: the flat /api/watchlist now reads/writes the user's DEFAULT
// list in the new multi-list model (watch_list_items). Existing callers
// (watchlist UI, overview, chat) keep working unchanged.

function toItem(r: any): WatchItem {
  return {
    id: r.id, symbol: r.symbol, idealBuy: r.ideal_buy ?? undefined, note: r.note ?? undefined,
    fairValue: r.fair_value ?? undefined, bullCase: r.bull_case ?? undefined, bearCase: r.bear_case ?? undefined,
    catalyst: r.catalyst ?? undefined, aiAction: r.ai_action ?? undefined, analyzedAt: r.analyzed_at ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function listItems(ctx: { supabase: any }, listId: string) {
  const { data } = await ctx.supabase.from("watch_list_items").select("*").eq("list_id", listId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  return (data ?? []).map(toItem);
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const listId = await ensureDefaultList(ctx);
  return NextResponse.json(await listItems(ctx, listId));
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const listId = await ensureDefaultList(ctx);

  const { data: existing } = await ctx.supabase
    .from("watch_list_items").select("id").eq("list_id", listId).eq("symbol", symbol).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.idealBuy != null) patch.ideal_buy = Number(body.idealBuy);
    if (body.note != null) patch.note = body.note;
    await ctx.supabase.from("watch_list_items").update(patch).eq("id", existing.id);
  } else {
    const { data: minRow } = await ctx.supabase
      .from("watch_list_items").select("sort_order").eq("list_id", listId).order("sort_order", { ascending: true }).limit(1).maybeSingle();
    const sortOrder = (minRow?.sort_order ?? 0) - 1;
    await ctx.supabase.from("watch_list_items").insert({
      user_id: ctx.userId, list_id: listId, symbol,
      ideal_buy: body.idealBuy != null ? Number(body.idealBuy) : null, note: body.note ?? null, sort_order: sortOrder,
    });
  }
  return NextResponse.json(await listItems(ctx, listId));
}

// PATCH { order: string[] } — reorder the default list.
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body?.order) ? body.order : [];
  if (!order.length) return NextResponse.json({ error: "order array required" }, { status: 400 });
  const listId = await ensureDefaultList(ctx);
  await Promise.all(order.map((id, i) => ctx.supabase.from("watch_list_items").update({ sort_order: i }).eq("id", id)));
  return NextResponse.json(await listItems(ctx, listId));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("watch_list_items").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
