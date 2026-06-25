import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST { symbol } — record that the user viewed a ticker (upsert viewed_at).
// Fire-and-forget from the Research page. GET — the 20 most recent symbols.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase().trim();
  if (!symbol || symbol.length > 12) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  await ctx.supabase.from("recently_viewed").upsert(
    { user_id: ctx.userId, symbol, viewed_at: new Date().toISOString() },
    { onConflict: "user_id,symbol" },
  );
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ symbols: [] });
  const { data } = await ctx.supabase.from("recently_viewed").select("symbol").order("viewed_at", { ascending: false }).limit(20);
  return NextResponse.json({ symbols: (data ?? []).map((r: any) => r.symbol) });
}
