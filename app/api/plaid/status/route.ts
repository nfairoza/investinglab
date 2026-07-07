import { NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/status — lightweight: which institutions the current user has
// linked (names + account counts), and whether Plaid is configured. No tokens.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ configured: false, items: [] });
  const { data, error } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, institution_logo, institution_color, accounts, created_at")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });

  interface PlaidAccountJson {
    name: string;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
  }
  interface PlaidItemRow {
    item_id: string;
    institution_name?: string | null;
    institution_logo?: string | null;
    institution_color?: string | null;
    accounts?: PlaidAccountJson[] | null;
    created_at: string;
  }
  const items = (data ?? []).map((r: PlaidItemRow) => {
    const accts = Array.isArray(r.accounts) ? r.accounts : [];
    return {
      itemId: r.item_id,
      institution: r.institution_name ?? "Institution",
      logo: r.institution_logo ?? null,
      color: r.institution_color ?? null,
      accountCount: accts.length,
      accounts: accts.map((a: PlaidAccountJson) => ({
        name: a.name,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
      })),
    };
  });
  return NextResponse.json({ configured: plaidConfigured(), items });
}
