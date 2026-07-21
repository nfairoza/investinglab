import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/service-client";
import { syncItem, type ItemRow } from "@/lib/plaid/sync";
import { selectPlaidItems } from "@/lib/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/plaid/webhook — Plaid calls this when an item has updates. The one we
// care about for freshness is TRANSACTIONS / SYNC_UPDATES_AVAILABLE, fired when
// Plaid has finished pulling new activity from the bank (including the async
// result of an on-demand transactions/refresh). We look up the item's owner and
// run a sync so the new transactions land WITHOUT the user clicking Refresh.
//
// Also handles the ITEM webhooks (ERROR / PENDING_EXPIRATION) — a sync will flip
// the item to reauth_required + deliver the nudge via the shared syncItem path.
//
// No auth header: Plaid webhooks are unauthenticated by design (verify via the
// JWT in production if PLAID_WEBHOOK_VERIFY is enabled — omitted here; the handler
// only triggers a sync of an item we already own, so a spurious call is harmless).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const type = String(body?.webhook_type ?? "");
  const code = String(body?.webhook_code ?? "");
  const itemId = typeof body?.item_id === "string" ? body.item_id : "";
  if (!itemId) return NextResponse.json({ ok: true, ignored: "no item_id" });

  // Only act on codes that mean "new data is ready" or "item needs attention".
  const actionable =
    (type === "TRANSACTIONS" && (code === "SYNC_UPDATES_AVAILABLE" || code === "DEFAULT_UPDATE" || code === "INITIAL_UPDATE" || code === "HISTORICAL_UPDATE")) ||
    (type === "ITEM" && (code === "ERROR" || code === "PENDING_EXPIRATION" || code === "NEW_ACCOUNTS_AVAILABLE"));
  if (!actionable) return NextResponse.json({ ok: true, ignored: `${type}/${code}` });

  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "no service client" }, { status: 200 });

  // Find the item (and its owner) by item_id, across all users (service role).
  const { rows } = await selectPlaidItems(db, "item_id, institution_name, cursor, status, user_id");
  const item = (rows ?? []).find((r: any) => r.item_id === itemId) as (ItemRow & { user_id?: string }) | undefined;
  if (!item?.user_id) return NextResponse.json({ ok: true, ignored: "unknown item" });

  const result = await syncItem(db, item.user_id, item).catch(() => null);
  return NextResponse.json({ ok: true, item: itemId, added: result?.added ?? 0, status: result?.status ?? "unknown" });
}
