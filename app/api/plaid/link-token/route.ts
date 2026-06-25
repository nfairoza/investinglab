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
      // Only Transactions is REQUIRED — that lets ANY bank/credit/depository
      // institution link. Investments + Liabilities are OPTIONAL: pulled when the
      // institution/account actually has them, but they never block linking a
      // plain checking/savings/credit account. (Listing Investments as required
      // caused Plaid to reject banks with no brokerage account — "none of your
      // accounts are investment accounts".)
      products: [Products.Transactions],
      optional_products: [Products.Investments, Products.Liabilities],
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
