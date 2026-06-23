import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/robinhood/import  { rows: [{ symbol, shares, avgCost }] }
// Robinhood has no safe official API, so we import positions from a pasted/
// uploaded CSV. Replaces all of the CURRENT user's robinhood-sourced rows;
// leaves their manual + E*TRADE rows untouched.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "No rows to import." }, { status: 400 });

  const incoming = rows
    .map((r: any) => ({
      user_id: ctx.userId,
      symbol: String(r.symbol ?? "").toUpperCase().trim(),
      shares: Number(r.shares ?? 0),
      avg_cost: Number(r.avgCost ?? 0),
      note: "Imported from Robinhood",
      source: "robinhood",
      updated_at: new Date().toISOString(),
    }))
    .filter((h: any) => h.symbol && Number.isFinite(h.shares) && h.shares > 0);

  if (!incoming.length) return NextResponse.json({ error: "No valid rows (need symbol + shares)." }, { status: 400 });

  await ctx.supabase.from("holdings").delete().eq("source", "robinhood");
  await ctx.supabase.from("holdings").insert(incoming);

  return NextResponse.json({ imported: incoming.length });
}
