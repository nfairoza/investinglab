import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/accounts — live balances for all of the current user's linked
// institutions. Returns grouped accounts + a total cash figure (depository).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ items: [], totalCash: 0, configured: false });

  const { data: items } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, access_token");
  if (!items || items.length === 0) return NextResponse.json({ items: [], totalCash: 0 });

  const plaid = getPlaid();
  const out: any[] = [];
  let totalCash = 0;

  for (const it of items) {
    try {
      const resp = await plaid.accountsBalanceGet({ access_token: it.access_token });
      const accounts = (resp.data.accounts ?? []).map((a) => {
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
      out.push({ itemId: it.item_id, institution: it.institution_name, accounts });
    } catch (e: any) {
      out.push({ itemId: it.item_id, institution: it.institution_name, accounts: [], error: e?.response?.data?.error_code ?? "fetch_failed" });
    }
  }

  return NextResponse.json({ items: out, totalCash: +totalCash.toFixed(2) });
}
