import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/watchlists/[id]/items { symbol } — add one stock to the list.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase().trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  // Don't add to a followed list (those are live references, not item stores).
  const { data: list } = await ctx.supabase.from("watch_lists").select("kind").eq("id", params.id).maybeSingle();
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (list.kind === "followed") return NextResponse.json({ error: "cannot add items to a followed list" }, { status: 400 });

  await ctx.supabase.from("watch_list_items").upsert(
    { user_id: ctx.userId, list_id: params.id, symbol, note: body.note ?? null, ideal_buy: body.idealBuy != null ? Number(body.idealBuy) : null },
    { onConflict: "list_id,symbol" },
  );
  return NextResponse.json({ ok: true });
}

// DELETE /api/watchlists/[id]/items?symbol= — remove one stock from the list.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  const id = req.nextUrl.searchParams.get("itemId");
  if (!symbol && !id) return NextResponse.json({ error: "symbol or itemId required" }, { status: 400 });
  let q = ctx.supabase.from("watch_list_items").delete().eq("list_id", params.id);
  q = id ? q.eq("id", id) : q.eq("symbol", symbol!);
  await q;
  return NextResponse.json({ ok: true });
}
