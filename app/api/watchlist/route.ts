import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import type { WatchItem } from "@/lib/db";

export const dynamic = "force-dynamic";

// Map a Supabase row (snake_case) to the WatchItem shape the UI uses (camelCase).
function toItem(r: any): WatchItem {
  return {
    id: r.id,
    symbol: r.symbol,
    idealBuy: r.ideal_buy ?? undefined,
    note: r.note ?? undefined,
    fairValue: r.fair_value ?? undefined,
    bullCase: r.bull_case ?? undefined,
    bearCase: r.bear_case ?? undefined,
    catalyst: r.catalyst ?? undefined,
    aiAction: r.ai_action ?? undefined,
    analyzedAt: r.analyzed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await ctx.supabase
    .from("watchlist").select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(toItem));
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  // Upsert on (user_id, symbol): update if it exists, else insert at the top.
  const { data: existing } = await ctx.supabase
    .from("watchlist").select("id").eq("symbol", symbol).maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.idealBuy != null) patch.ideal_buy = Number(body.idealBuy);
    if (body.note != null) patch.note = body.note;
    await ctx.supabase.from("watchlist").update(patch).eq("id", existing.id);
  } else {
    // New items sort to the top (lowest sort_order).
    const { data: minRow } = await ctx.supabase
      .from("watchlist").select("sort_order").order("sort_order", { ascending: true }).limit(1).maybeSingle();
    const sortOrder = (minRow?.sort_order ?? 0) - 1;
    await ctx.supabase.from("watchlist").insert({
      user_id: ctx.userId,
      symbol,
      ideal_buy: body.idealBuy != null ? Number(body.idealBuy) : null,
      note: body.note ?? null,
      sort_order: sortOrder,
    });
  }

  const { data } = await ctx.supabase.from("watchlist").select("*")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  return NextResponse.json((data ?? []).map(toItem));
}

// PATCH { order: string[] } — reorder by writing sort_order in array order.
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body?.order) ? body.order : [];
  if (!order.length) return NextResponse.json({ error: "order array required" }, { status: 400 });

  await Promise.all(order.map((id, i) =>
    ctx.supabase.from("watchlist").update({ sort_order: i }).eq("id", id),
  ));

  const { data } = await ctx.supabase.from("watchlist").select("*")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  return NextResponse.json((data ?? []).map(toItem));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("watchlist").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
