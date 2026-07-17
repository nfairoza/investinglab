import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { writeSnapshot } from "@/lib/plaid-snapshot";
import { syncAllItems } from "@/lib/plaid/sync";
import type { AccountBase } from "plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/plaid/refresh — force a live Plaid pull for every linked item:
//   1. transactions sync (added/modified/removed) from the stored cursor, which
//      also refreshes stale snapshots, flips de-authed items to reauth_required,
//      and rebuilds the ledger on new activity (the shared syncAllItems core).
//   2. a fresh balances snapshot so cash numbers update immediately.
// This is the on-demand path the Accounts "Refresh" button hits — it now pulls
// TRANSACTIONS too, not just balances (previously it only did balances, so new
// spending never appeared on Refresh). Non-blocking for the user.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ ok: false, configured: false });

  const { rows: items, error } = await selectPlaidItems(ctx.supabase, "item_id");
  if (error) return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ ok: true, refreshed: 0, added: 0 });

  // (1) Transactions sync + ledger rebuild (error-aware; never throws).
  const syncResults = await syncAllItems(ctx.supabase, ctx.userId).catch(() => []);
  const added = syncResults.reduce((s, r) => s + r.added, 0);

  // (2) Fresh balances snapshot for immediate cash updates.
  const plaid = getPlaid();
  const balResults = await Promise.allSettled(
    items.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.accountsBalanceGet({ access_token: token }).then((r) => ({ itemId: it.item_id, accounts: r.data.accounts ?? [] }));
    }),
  );
  let refreshed = 0;
  await Promise.all(balResults.map(async (r) => {
    if (r.status === "fulfilled") {
      await writeSnapshot(ctx.supabase, ctx.userId, r.value.itemId, "balances", r.value.accounts as AccountBase[]);
      refreshed++;
    }
  }));

  return NextResponse.json({ ok: true, refreshed, added });
}
