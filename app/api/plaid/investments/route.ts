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
        const ticker = sec?.ticker_symbol?.trim() || null;
        // A "real" ticker is a short alphanumeric symbol we can price/research.
        // CUSIPs (9-char) and fund names are NOT tradeable tickers.
        const hasRealTicker = !!ticker && /^[A-Z][A-Z.\-]{0,5}$/.test(ticker.toUpperCase());
        // RSU / vesting awards: Plaid returns vested_quantity / vested_value for
        // institutions that support it. Vested = you own it now (counts in current
        // value/net worth); the rest of the position is UNVESTED = potential.
        const fullValue = h.institution_value ?? null;
        const vestedValue = (h as any).vested_value ?? null;
        const vestedQty = (h as any).vested_quantity ?? null;
        const hasVesting = vestedValue != null && fullValue != null && vestedValue < fullValue - 0.01;
        holdings.push({
          symbol: hasRealTicker ? ticker!.toUpperCase() : (sec?.name ?? "—"),
          name: sec?.name ?? null,
          hasRealTicker,
          quantity: h.quantity,
          price: h.institution_price ?? sec?.close_price ?? null,
          value: fullValue,
          costBasis: h.cost_basis ?? null,
          currency: h.iso_currency_code ?? "USD",
          institution: it.institution_name,
          // Vesting split (null when the institution doesn't report it).
          vestedQuantity: vestedQty,
          vestedValue,
          potentialValue: hasVesting ? +(fullValue - vestedValue).toFixed(2) : null,
          hasVesting,
          // Plaid security type: equity | etf | mutual fund | cryptocurrency |
          // derivative | fixed income | cash | other — used to classify the row.
          secType: (sec as any)?.type ?? null,
          isCashEquivalent: (sec as any)?.is_cash_equivalent ?? false,
        });
      }
    } catch { /* skip item (account may not support investments) */ }
  }

  return NextResponse.json({ holdings });
}
