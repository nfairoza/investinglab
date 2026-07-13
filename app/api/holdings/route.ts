import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "@/lib/supabase-data";
import { plaidHoldings } from "@/lib/holdings-server";
import type { Holding } from "@/lib/db";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// E3 — invalidate the user's look-through cache on any holdings change so the next
// /api/lookthrough read recomputes fresh (cheaper than a synchronous recompute on
// the write path; the nightly job also rebuilds it). Best-effort.
async function invalidateLookthrough(ctx: { supabase: SupabaseClient; userId: string }): Promise<void> {
  try { await ctx.supabase.from("lookthrough_exposure").delete().eq("user_id", ctx.userId); } catch { /* non-critical */ }
}

interface HoldingRow {
  id: string;
  symbol: string;
  shares: number | string;
  avg_cost: number | string;
  note?: string | null;
  source?: string | null;
  asset_type?: Holding["assetType"] | null;
  days_gain?: number | null;
  days_gain_pct?: number | null;
  total_gain?: number | null;
  total_gain_pct?: number | null;
  market_value?: number | null;
  created_at: string;
  updated_at: string;
}

function toHolding(r: HoldingRow): Holding {
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

async function listHoldings(ctx: { supabase: SupabaseClient }) {
  const { data } = await ctx.supabase.from("holdings").select("*").order("created_at", { ascending: true });
  return (data ?? []).map(toHolding);
}

export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await listHoldings(ctx);
  // ?withBrokers=1 merges Plaid brokerage holdings (vested-only) for read-only
  // consumers (Rankings, Reports, Portfolio Doctor gating) so they see the full
  // portfolio. The Holdings page omits this — it merges Plaid itself for editing.
  if (req.nextUrl.searchParams.get("withBrokers") === "1") {
    const plaid = await plaidHoldings(ctx.supabase, ctx.userId);
    const haveEtrade = db.some((h: Holding) => h.source === "etrade");
    const isEtradeInst = (n: string) => /e[\s*]*trade|morgan stanley/i.test(n);
    const plaidRows: Holding[] = plaid
      .filter((p) => p.hasRealTicker && !(haveEtrade && isEtradeInst(p.source)))
      .map((p) => ({
        id: `plaid:${p.source}:${p.symbol}`,
        symbol: p.symbol, shares: p.shares, avgCost: p.avgCost,
        source: p.source, marketValue: p.value ?? undefined,
      }) as Holding);
    return NextResponse.json([...db, ...plaidRows]);
  }
  return NextResponse.json(db);
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    replace: z.boolean().optional(),
    holdings: z.array(z.any()).optional(),
    source: z.string().optional(),
    symbol: z.string().optional(),
    shares: z.coerce.number().optional(),
    avgCost: z.coerce.number().optional(),
    note: z.string().optional(),
  }));
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

  // Bulk replace from a broker sync (E*TRADE / Robinhood).
  if (body.replace === true && Array.isArray(body.holdings)) {
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
    await invalidateLookthrough(ctx);
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
  await invalidateLookthrough(ctx);
  return NextResponse.json(await listHoldings(ctx));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("holdings").delete().eq("id", id);
  await invalidateLookthrough(ctx);
  return NextResponse.json({ ok: true });
}
