import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import type { JournalEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

function toEntry(r: any): JournalEntry {
  return {
    id: r.id,
    symbol: r.symbol,
    side: r.side,
    entryReason: r.entry_reason ?? "",
    targetPrice: r.target_price ?? undefined,
    stopLoss: r.stop_loss ?? undefined,
    exitCriteria: r.exit_criteria ?? undefined,
    status: r.status,
    result1w: r.result_1w ?? undefined,
    result1m: r.result_1m ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("journal").select("*").order("created_at", { ascending: false });
  return NextResponse.json((data ?? []).map(toEntry));
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // Patch existing entry.
  if (body?.id) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.result1w !== undefined) patch.result_1w = body.result1w;
    if (body.result1m !== undefined) patch.result_1m = body.result1m;
    const { data, error } = await ctx.supabase.from("journal").update(patch).eq("id", body.id).select("*").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(toEntry(data));
  }

  // New entry.
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol || !body?.entryReason) {
    return NextResponse.json({ error: "symbol and entryReason required" }, { status: 400 });
  }
  const { data, error } = await ctx.supabase.from("journal").insert({
    user_id: ctx.userId,
    symbol,
    side: body.side === "sell" ? "sell" : "buy",
    entry_reason: String(body.entryReason),
    target_price: body.targetPrice != null ? Number(body.targetPrice) : null,
    stop_loss: body.stopLoss != null ? Number(body.stopLoss) : null,
    exit_criteria: body.exitCriteria ?? null,
    status: "open",
  }).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toEntry(data));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("journal").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
