import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/plaid/disconnect { itemId }
// CRITICAL ORDER: call Plaid /item/remove FIRST (with the decrypted access
// token), and only AFTER Plaid confirms removal delete the row locally. Deleting
// the token without /item/remove orphans a live Plaid Item we can no longer
// manage (the token was the only handle). Owner-scoped via getUserClient.
//
// Note: on the Plaid Trial, /item/remove does NOT free a slot — the cap counts
// Items EVER created — so we deliberately do NOT touch the audit counter here.
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

  if (!row) return NextResponse.json({ error: "Connection not found." }, { status: 404 });

  // 1) Remove at Plaid first. If this fails, STOP — do not delete locally.
  if (row.access_token && plaidConfigured()) {
    try {
      await getPlaid().itemRemove({ access_token: row.access_token });
    } catch (e: any) {
      const msg = e?.response?.data?.error_message ?? "Couldn't disconnect at Plaid. Please try again.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // 2) Plaid confirmed — now purge the item (and its cached data) locally.
  await ctx.supabase.from("plaid_items").delete().eq("item_id", itemId);
  return NextResponse.json({ ok: true });
}
