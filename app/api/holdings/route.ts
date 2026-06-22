import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import type { Holding } from "@/lib/db";

export const dynamic = "force-dynamic";

function toHolding(r: any): Holding {
  return {
    id: r.id,
    symbol: r.symbol,
    shares: Number(r.shares),
    avgCost: Number(r.avg_cost),
    note: r.note ?? undefined,
    source: r.source ?? "manual",
    assetType: r.asset_type ?? undefined,
    daysGain: r.days_gain ?? undefined,
    daysGainPct: r.days_gain_pct ?? undefined,
    totalGain: r.total_gain ?? undefined,
    totalGainPct: r.total_gain_pct ?? undefined,
    marketValue: r.market_value ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function listHoldings(ctx: { supabase: any }) {
  const { data } = await ctx.supabase.from("holdings").select("*").order("created_at", { ascending: true });
  return (data ?? []).map(toHolding);
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listHoldings(ctx));
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);

  // Bulk replace from a broker sync (E*TRADE / Robinhood).
  if (body?.replace === true && Array.isArray(body?.holdings)) {
    const src = String(body.source ?? body.holdings[0]?.source ?? "etrade");
    const rows = (body.holdings as any[]).map((h) => ({
      user_id: ctx.userId,
      symbol: String(h.symbol).toUpperCase(),
      shares: Number(h.shares),
      avg_cost: Number(h.avgCost ?? 0),
      note: h.note ?? null,
      source: h.source ?? src,
      asset_type: h.assetType ?? "stock",
      days_gain: num(h.daysGain),
      days_gain_pct: num(h.daysGainPct),
      total_gain: num(h.totalGain),
      total_gain_pct: num(h.totalGainPct),
      market_value: num(h.marketValue),
      updated_at: new Date().toISOString(),
    }));
    const incomingSymbols = rows.map((r) => r.symbol);
    // Replace this source's rows: delete existing rows for that source, plus any
    // manual row whose symbol the broker now owns (broker is authoritative).
    await ctx.supabase.from("holdings").delete().eq("source", src);
    if (incomingSymbols.length) {
      await ctx.supabase.from("holdings").delete().eq("source", "manual").in("symbol", incomingSymbols);
    }
    if (rows.length) await ctx.supabase.from("holdings").insert(rows);
    return NextResponse.json(await listHoldings(ctx));
  }

  // Single upsert by symbol.
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const { data: existing } = await ctx.supabase.from("holdings").select("id").eq("symbol", symbol).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.shares != null) patch.shares = Number(body.shares);
    if (body.avgCost != null) patch.avg_cost = Number(body.avgCost);
    if (body.note != null) patch.note = body.note;
    await ctx.supabase.from("holdings").update(patch).eq("id", existing.id);
  } else {
    await ctx.supabase.from("holdings").insert({
      user_id: ctx.userId,
      symbol,
      shares: Number(body.shares ?? 0),
      avg_cost: Number(body.avgCost ?? 0),
      note: body.note ?? null,
      source: body.source ?? "manual",
    });
  }
  return NextResponse.json(await listHoldings(ctx));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("holdings").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
