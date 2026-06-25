import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

function toItem(r: any) {
  return {
    id: r.id, symbol: r.symbol, note: r.note ?? undefined, idealBuy: r.ideal_buy ?? undefined,
    fairValue: r.fair_value ?? undefined, bullCase: r.bull_case ?? undefined, bearCase: r.bear_case ?? undefined,
    catalyst: r.catalyst ?? undefined, aiAction: r.ai_action ?? undefined, analyzedAt: r.analyzed_at ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// GET /api/watchlists/[id] — the list's metadata + its items (custom/default).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: list } = await ctx.supabase.from("watch_lists").select("*").eq("id", params.id).maybeSingle();
  if (!list) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: items } = await ctx.supabase
    .from("watch_list_items").select("*").eq("list_id", params.id)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });

  return NextResponse.json({
    list: { id: list.id, name: list.name, kind: list.kind, presetKey: list.preset_key ?? null },
    items: (items ?? []).map(toItem),
  });
}
