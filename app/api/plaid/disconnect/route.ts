import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/plaid/disconnect { itemId } — removes a linked institution: tells
// Plaid to invalidate the access token, then deletes the row. Owner-scoped.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const { data: row } = await ctx.supabase
    .from("plaid_items")
    .select("access_token")
    .eq("item_id", itemId)
    .maybeSingle();

  if (row?.access_token && plaidConfigured()) {
    try { await getPlaid().itemRemove({ access_token: row.access_token }); } catch { /* still delete locally */ }
  }
  await ctx.supabase.from("plaid_items").delete().eq("item_id", itemId);
  return NextResponse.json({ ok: true });
}
