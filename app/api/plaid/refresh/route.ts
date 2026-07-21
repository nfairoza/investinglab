import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { writeSnapshot } from "@/lib/plaid-snapshot";
import { syncAllItems } from "@/lib/plaid/sync";
import type { AccountBase } from "plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/plaid/refresh — force a live Plaid pull for every linked item:
//   0. transactions/refresh — ASK PLAID to re-fetch from the bank right now.
//      transactionsSync only returns what Plaid has already cached (it refreshes
//      the bank on its own ~daily schedule), so without this an on-demand Refresh
//      can't surface activity newer than Plaid's last background pull. This kicks
//      that pull; the new data lands within seconds.
//   1. transactions sync (added/modified/removed) from the stored cursor, which
//      also refreshes stale snapshots, flips de-authed items to reauth_required,
//      and rebuilds the ledger on new activity (the shared syncAllItems core).
//   2. a fresh balances snapshot so cash numbers update immediately.
// This is the on-demand path the Accounts "Refresh" button hits.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ ok: false, configured: false });

  const { rows: items, error } = await selectPlaidItems(ctx.supabase, "item_id");
  if (error) return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ ok: true, refreshed: 0, added: 0 });

  const plaid = getPlaid();

  // (0) Force Plaid to pull fresh transactions from each bank NOW. transactionsSync
  // only returns Plaid's cache (refreshed on its own ~daily cadence), so this is
  // what surfaces activity newer than Plaid's last background pull. On a plan/
  // product WITHOUT on-demand refresh Plaid 4xxs (e.g. PRODUCTS_NOT_SUPPORTED) —
  // we capture that code so the UI can say why the newest txn isn't advancing.
  const refreshResults = await Promise.allSettled(
    items.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.transactionsRefresh({ access_token: token });
    }),
  );
  const forced = refreshResults.some((r) => r.status === "fulfilled");
  // The first distinct Plaid error_code (if every item failed), for diagnosis.
  const refreshError = forced ? null : (() => {
    for (const r of refreshResults) {
      if (r.status === "rejected") {
        const code = (r.reason as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
        if (typeof code === "string") return code;
      }
    }
    return null;
  })();
  // Plaid populates the refreshed transactions asynchronously — give it a few
  // seconds so the sync below picks them up on THIS request (rather than the next).
  if (forced) await new Promise((res) => setTimeout(res, 6000));

  // (1) Transactions sync + ledger rebuild (error-aware; never throws).
  const syncResults = await syncAllItems(ctx.supabase, ctx.userId).catch(() => []);
  const added = syncResults.reduce((s, r) => s + r.added, 0);

  // (2) Fresh balances snapshot for immediate cash updates.
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

  // `forcedRefresh` = Plaid accepted the on-demand pull. `refreshError` = the code
  // it rejected with (e.g. PRODUCTS_NOT_SUPPORTED) when on-demand refresh isn't on
  // the plan — the honest reason the newest transaction may not advance.
  return NextResponse.json({ ok: true, refreshed, added, forcedRefresh: forced, refreshError });
}
