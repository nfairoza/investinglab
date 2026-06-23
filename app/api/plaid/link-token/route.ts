import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/plaid/link-token — creates a short-lived link_token the browser uses
// to open Plaid Link. Scoped to the current user.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }

  try {
    const resp = await getPlaid().linkTokenCreate({
      user: { client_user_id: ctx.userId },
      client_name: "rukMoney",
      products: [Products.Transactions, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e: any) {
    const msg = e?.response?.data?.error_message ?? (e instanceof Error ? e.message : "Failed to create link token");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
