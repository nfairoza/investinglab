import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/transactions — recent spending across the user's linked banks,
// via Plaid's incremental sync. Persists the cursor per item so each call only
// pulls new activity. Returns the most recent ~100 merged + sorted.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ transactions: [], configured: false });

  const { data: items } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, access_token, cursor");
  if (!items || items.length === 0) return NextResponse.json({ transactions: [] });

  const plaid = getPlaid();
  const all: any[] = [];

  for (const it of items) {
    try {
      let cursor: string | undefined = it.cursor ?? undefined;
      let added: any[] = [];
      let hasMore = true;
      // Walk the sync pages until caught up.
      for (let guard = 0; guard < 10 && hasMore; guard++) {
        const resp = await plaid.transactionsSync({ access_token: it.access_token, cursor });
        added = added.concat(resp.data.added);
        cursor = resp.data.next_cursor;
        hasMore = resp.data.has_more;
      }
      // Save the cursor for next time.
      await ctx.supabase.from("plaid_items").update({ cursor, updated_at: new Date().toISOString() }).eq("item_id", it.item_id);

      for (const t of added) {
        all.push({
          id: t.transaction_id,
          date: t.date,
          name: t.name,
          merchant: t.merchant_name ?? null,
          amount: t.amount,
          currency: t.iso_currency_code ?? "USD",
          category: t.personal_finance_category?.primary ?? (t.category?.[0] ?? null),
          institution: it.institution_name,
          pending: t.pending,
        });
      }
    } catch { /* skip this item on error */ }
  }

  all.sort((a, b) => (a.date < b.date ? 1 : -1));
  return NextResponse.json({ transactions: all.slice(0, 100) });
}
