import { NextResponse } from "next/server";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/investments — investment holdings across the user's linked
// brokerage/retirement accounts (read-only). Maps to a simple holdings shape.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ holdings: [], configured: false });

  const { data: items } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, access_token");
  if (!items || items.length === 0) return NextResponse.json({ holdings: [] });

  const plaid = getPlaid();
  const holdings: any[] = [];

  for (const it of items) {
    try {
      const resp = await plaid.investmentsHoldingsGet({ access_token: it.access_token });
      const securities = new Map((resp.data.securities ?? []).map((s) => [s.security_id, s]));
      for (const h of resp.data.holdings ?? []) {
        const sec = securities.get(h.security_id);
        holdings.push({
          symbol: sec?.ticker_symbol ?? sec?.name ?? "—",
          name: sec?.name ?? null,
          quantity: h.quantity,
          price: h.institution_price ?? sec?.close_price ?? null,
          value: h.institution_value ?? null,
          costBasis: h.cost_basis ?? null,
          currency: h.iso_currency_code ?? "USD",
          institution: it.institution_name,
        });
      }
    } catch { /* skip item (account may not support investments) */ }
  }

  return NextResponse.json({ holdings });
}
