import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { writeSnapshot } from "@/lib/plaid-snapshot";
import type { AccountBase } from "plaid";

export const dynamic = "force-dynamic";

// POST /api/plaid/refresh — force a live Plaid pull for every linked item and
// overwrite the balances snapshot (PA-A1). The client pings this after first
// paint when the accounts response came back `stale:true`; SWR then revalidates
// /api/plaid/accounts and shows fresh numbers. Non-blocking for the user.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ ok: false, configured: false });

  const { rows: items, error } = await selectPlaidItems(ctx.supabase, "item_id");
  if (error) return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ ok: true, refreshed: 0 });

  const plaid = getPlaid();
  const results = await Promise.allSettled(
    items.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.accountsBalanceGet({ access_token: token }).then((r) => ({ itemId: it.item_id, accounts: r.data.accounts ?? [] }));
    }),
  );

  let refreshed = 0;
  await Promise.all(results.map(async (r) => {
    if (r.status === "fulfilled") {
      await writeSnapshot(ctx.supabase, ctx.userId, r.value.itemId, "balances", r.value.accounts as AccountBase[]);
      refreshed++;
    }
  }));

  return NextResponse.json({ ok: true, refreshed });
}
