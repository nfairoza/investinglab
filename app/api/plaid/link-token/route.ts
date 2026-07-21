import { NextRequest, NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { getPlaid, plaidConfigured, plaidCapReached, selectPlaidItems, resolvePlaidToken, plaidWebhookUrl } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { requirePlan } from "@/lib/billing/plan";

export const dynamic = "force-dynamic";

// POST /api/plaid/link-token — creates a short-lived link_token the browser uses
// to open Plaid Link. Scoped to the current user. Blocked at the app-wide cap.
//
// ?update=<itemId> → UPDATE MODE: creates a link token carrying the existing
// item's access_token so the user re-authenticates a de-authed bank WITHOUT
// re-picking accounts and WITHOUT losing data (no new Item is created). The cap
// doesn't apply to update mode (it's not a new connection).
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // BILL B2 — the free tier excludes Plaid entirely (linked banks are the marginal
  // cost). Gate server-side; 402 the UI maps to an upsell. Billing-off/admin pass.
  const gate = await requirePlan("plaid_link");
  if (gate) return gate;
  if (!plaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  }

  const updateItemId = req.nextUrl.searchParams.get("update");
  if (updateItemId) {
    // Update mode: resolve the item's token and mint an access_token-scoped link
    // token. No `products`, no cap check — this re-auths an existing Item.
    const { rows } = await selectPlaidItems(ctx.supabase, "item_id, institution_name");
    const item = (rows ?? []).find((r: any) => r.item_id === updateItemId);
    if (!item) return NextResponse.json({ error: "item_not_found" }, { status: 404 });
    const token = resolvePlaidToken(item as any);
    if (!token) return NextResponse.json({ error: "no_token" }, { status: 400 });
    try {
      const resp = await getPlaid().linkTokenCreate({
        user: { client_user_id: ctx.userId },
        client_name: "rukMoney",
        access_token: token,
        country_codes: [CountryCode.Us],
        language: "en",
        ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
      });
      return NextResponse.json({ link_token: resp.data.link_token, update: true });
    } catch (e) {
      const msg = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message ?? (e instanceof Error ? e.message : "Failed to create update link token");
      return NextResponse.json({ error: msg }, { status: 500 });
    }
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
      // Transactions is the base product (Plaid requires at least one entry in
      // `products` — an empty array errors with "at least one product must be
      // specified"). It's supported by essentially all banks, cards, and
      // depository accounts. Investments + Liabilities are
      // required_if_supported: initialized when the institution supports them,
      // but their ABSENCE never blocks the link — so a checking-only bank
      // (Chase), a credit card, and a brokerage/retirement provider all link,
      // each contributing whatever data it has. (Listing Investments in
      // `products` is what made Plaid reject banks with no brokerage account.)
      products: [Products.Transactions],
      required_if_supported_products: [Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      // Webhook so Plaid pushes SYNC_UPDATES_AVAILABLE when new activity is ready
      // (the async result of background pulls + on-demand refresh). Without it,
      // new transactions only appear on the next manual/cron sync.
      ...(plaidWebhookUrl() ? { webhook: plaidWebhookUrl() } : {}),
      // Required for bank OAuth flows (Chase, etc.). Must exactly match an
      // allowed redirect URI registered in the Plaid dashboard.
      ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e) {
    const msg = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message ?? (e instanceof Error ? e.message : "Failed to create link token");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
