import { NextRequest, NextResponse } from "next/server";
import { CountryCode } from "plaid";
import { getPlaid, plaidConfigured, plaidCapReached, recordPlaidItemCreated } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/plaid/exchange { public_token }
// Plaid Link returns a public_token on success; we exchange it for a long-lived
// access_token and persist the item (+ account metadata + institution) for the
// current user. The access_token NEVER goes back to the browser.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });
  // Re-check the cap at exchange (closes the race between link-token and finish).
  if (await plaidCapReached()) {
    return NextResponse.json({ error: "cap_reached", message: "Account connections are currently at their limit. Please reach out to your admin for more information." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const publicToken = typeof body?.public_token === "string" ? body.public_token : "";
  if (!publicToken) return NextResponse.json({ error: "public_token required" }, { status: 400 });

  try {
    const plaid = getPlaid();
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    // Pull account list + institution for display.
    const accountsResp = await plaid.accountsGet({ access_token: accessToken });
    const accounts = (accountsResp.data.accounts ?? []).map((a) => ({
      account_id: a.account_id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
    }));
    const institutionId = accountsResp.data.item?.institution_id ?? null;

    let institutionName: string | null = null;
    let institutionLogo: string | null = null;
    let institutionColor: string | null = null;
    if (institutionId) {
      try {
        const inst = await plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
          options: { include_optional_metadata: true },
        });
        institutionName = inst.data.institution?.name ?? null;
        // Plaid returns a base64 PNG (no data: prefix) + a brand hex color.
        const logo = inst.data.institution?.logo;
        institutionLogo = logo ? `data:image/png;base64,${logo}` : null;
        institutionColor = inst.data.institution?.primary_color ?? null;
      } catch { /* metadata is best-effort */ }
    }

    await ctx.supabase.from("plaid_items").upsert(
      {
        user_id: ctx.userId,
        item_id: itemId,
        access_token: accessToken,
        institution_id: institutionId,
        institution_name: institutionName,
        institution_logo: institutionLogo,
        institution_color: institutionColor,
        accounts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_id" },
    );

    // Record in the app-wide audit so the cap counts Items ever created.
    await recordPlaidItemCreated(ctx.userId, itemId).catch(() => {});

    return NextResponse.json({ ok: true, institution: institutionName, accounts: accounts.length });
  } catch (e: any) {
    const msg = e?.response?.data?.error_message ?? (e instanceof Error ? e.message : "Failed to link account");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
