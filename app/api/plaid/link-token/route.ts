import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid, plaidConfigured, plaidCapReached } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/plaid/link-token — creates a short-lived link_token the browser uses
// to open Plaid Link. Scoped to the current user. Blocked at the app-wide cap.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }
  // App-wide connection cap (Plaid Trial = 10 Items ever created). Server-side
  // block — never rely on hiding the button. Existing connections keep working.
  if (await plaidCapReached()) {
    return NextResponse.json({ error: "cap_reached", message: "Account connections are currently at their limit. Please reach out to your admin for more information." }, { status: 403 });
  }

  try {
    const resp = await getPlaid().linkTokenCreate({
      user: { client_user_id: ctx.userId },
      client_name: "rukMoney",
      // Block NOTHING. `products: []` + `required_if_supported_products` means:
      // for EACH institution, request a product only if that institution
      // supports it, and never reject the link when it doesn't. So a checking-
      // only bank (Chase), a credit card, a pure brokerage (Robinhood), and a
      // retirement provider (Fidelity/Vanguard) all link — each contributing
      // whatever data it has. (Listing Investments in `products` is what made
      // Plaid reject banks with no brokerage account; requiring Transactions
      // would conversely block pure-brokerage institutions. This avoids both.)
      products: [],
      required_if_supported_products: [Products.Transactions, Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      // Required for bank OAuth flows (Chase, etc.). Must exactly match an
      // allowed redirect URI registered in the Plaid dashboard.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    const msg = e?.response?.data?.error_message ?? (e instanceof Error ? e.message : "Failed to create link token");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
