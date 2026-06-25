import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { ensureDefaultList } from "@/lib/watchlists";

export const dynamic = "force-dynamic";

// GET /api/watchlists — all of the user's lists with item counts.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureDefaultList(ctx);

  const { data: lists, error } = await ctx.supabase
    .from("watch_lists").select("*")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Item counts for custom/default lists (followed lists count live, client-side).
  const { data: items } = await ctx.supabase.from("watch_list_items").select("list_id");
  const counts: Record<string, number> = {};
  for (const it of items ?? []) counts[it.list_id] = (counts[it.list_id] ?? 0) + 1;

  return NextResponse.json((lists ?? []).map((l: any) => ({
    id: l.id, name: l.name, kind: l.kind, presetKey: l.preset_key ?? null,
    count: counts[l.id] ?? 0, createdAt: l.created_at,
  })));
}

// POST /api/watchlists { name } — create a custom list.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from("watch_lists").insert({ user_id: ctx.userId, name, kind: "custom" })
    .select("id, name, kind").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id, name: data?.name, kind: data?.kind, count: 0 });
}

// PATCH /api/watchlists { id, name } — rename a list (not the default's kind).
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const name = String(body?.name ?? "").trim().slice(0, 80);
  if (!id || !name) return NextResponse.json({ error: "id and name required" }, { status: 400 });
  await ctx.supabase.from("watch_lists").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}

// DELETE /api/watchlists?id= — delete a list (never the default).
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: list } = await ctx.supabase.from("watch_lists").select("kind").eq("id", id).maybeSingle();
  if (list?.kind === "default") return NextResponse.json({ error: "cannot delete default list" }, { status: 400 });
  await ctx.supabase.from("watch_lists").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
