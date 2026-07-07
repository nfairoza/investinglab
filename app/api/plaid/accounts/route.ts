import { NextRequest, NextResponse } from "next/server";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/accounts — live balances for all of the current user's linked
// institutions. Returns grouped accounts + a total cash figure (depository).
// ?debug=1 (admin) returns the RAW Plaid account types + balances so we can see
// exactly what a broker (e.g. E*TRADE) reports for its cash sweep.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ items: [], totalCash: 0, configured: false });
  const debug = req.nextUrl.searchParams.get("debug") === "1" && ctx.isAdmin;

  // Resilient to unmigrated enc columns; surfaces a real db error instead of the
  // connect-brokerage empty state.
  const { rows: items, error: itemsErr } = await selectPlaidItems(ctx.supabase, "item_id, institution_name");
  if (itemsErr) return NextResponse.json({ error: "db_error", message: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json({ items: [], totalCash: 0 });

  const plaid = getPlaid();
  const debugRows: Record<string, unknown>[] = [];
  let totalCash = 0;

  // Fetch every linked institution in parallel (was sequential await per item).
  const results = await Promise.allSettled(
    items.map((it) => {
      const token = resolvePlaidToken(it as any);
      if (!token) return Promise.reject(new Error("no token"));
      return plaid.accountsBalanceGet({ access_token: token });
    }),
  );

  const out = items.map((it, i) => {
    const r = results[i];
    if (r.status !== "fulfilled") {
      const e = r.reason as { response?: { data?: { error_code?: string } } };
      return { itemId: it.item_id, institution: it.institution_name, accounts: [], error: e?.response?.data?.error_code ?? "fetch_failed" };
    }
    if (debug) {
      for (const a of r.value.data.accounts ?? []) {
        debugRows.push({
          institution: it.institution_name, name: a.name, mask: a.mask,
          type: a.type, subtype: a.subtype,
          available: a.balances?.available ?? null, current: a.balances?.current ?? null,
        });
      }
    }
    const accounts = (r.value.data.accounts ?? []).map((a) => {
      const bal = a.balances?.current ?? 0;
      if (a.type === "depository") totalCash += a.balances?.available ?? bal ?? 0;
      return {
        account_id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        current: a.balances?.current ?? null,
        available: a.balances?.available ?? null,
        currency: a.balances?.iso_currency_code ?? "USD",
      };
    });
    return { itemId: it.item_id, institution: it.institution_name, accounts };
  });

  if (debug) return NextResponse.json({ debug: debugRows });
  return NextResponse.json({ items: out, totalCash: +totalCash.toFixed(2) });
}
