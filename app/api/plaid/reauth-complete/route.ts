import { NextRequest, NextResponse } from "next/server";
import { plaidConfigured, selectPlaidItems } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { syncItem, type ItemRow } from "@/lib/plaid/sync";

export const dynamic = "force-dynamic";

// POST /api/plaid/reauth-complete { item_id }
// Called after Plaid Link finishes in UPDATE MODE (the user re-authenticated a
// de-authed bank). Update mode reuses the SAME access_token, so there's nothing
// to exchange — we just clear the reauth flag and run a fresh sync (which stamps
// last_synced_at and, on success, sets status back to 'active').
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body?.item_id === "string" ? body.item_id : "";
  if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });

  const { rows } = await selectPlaidItems(ctx.supabase, "item_id, institution_name, cursor, status");
  const item = (rows ?? []).find((r: any) => r.item_id === itemId) as ItemRow | undefined;
  if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });

  // A successful sync clears the reauth flag (syncItem sets status='active' when
  // the item was previously reauth_required). If it STILL fails, syncItem re-flags
  // it — the banner stays up, which is the honest outcome.
  const result = await syncItem(ctx.supabase, ctx.userId, item);
  return NextResponse.json({ ok: result.status === "active", status: result.status, added: result.added });
}
