import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { isEntitled } from "@/lib/billing/entitlements";
import { recomputeLookthroughForUser } from "@/lib/lookthrough/run";
import type { SymbolExposure, SectorExposure } from "@/lib/lookthrough/compute";

export const dynamic = "force-dynamic";

// GET /api/lookthrough — the user's cached look-through exposure (E3). Premium-
// gated (etf_lookthrough); while billing is off, everyone is entitled. Reads the
// nightly-built lookthrough_exposure row; if none exists yet (new user / just
// changed holdings), computes it on the fly so the toggle isn't empty.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isEntitled("etf_lookthrough", "free", ctx.isAdmin)) {
    return NextResponse.json({ error: "upgrade_required", feature: "etf_lookthrough" }, { status: 402 });
  }

  const { data: row } = await ctx.supabase
    .from("lookthrough_exposure")
    .select("by_symbol, by_sector, total_value, computed_at")
    .maybeSingle();

  if (row) {
    return NextResponse.json({
      bySymbol: (row.by_symbol ?? []) as SymbolExposure[],
      bySector: (row.by_sector ?? []) as SectorExposure[],
      totalValue: Number(row.total_value) || 0,
      computedAt: row.computed_at,
      cached: true,
    });
  }

  // No cached row yet — compute once now (bounded: one user's holdings).
  try {
    const r = await recomputeLookthroughForUser(ctx.supabase, ctx.userId);
    return NextResponse.json({ bySymbol: r.bySymbol, bySector: r.bySector, totalValue: r.totalValue, computedAt: new Date().toISOString(), cached: false });
  } catch (e) {
    return NextResponse.json({ error: "compute_failed", message: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
