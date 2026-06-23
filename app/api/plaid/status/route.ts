import { NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/status — lightweight: which institutions the current user has
// linked (names + account counts), and whether Plaid is configured. No tokens.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ configured: false, items: [] });
  const { data } = await ctx.supabase
    .from("plaid_items")
    .select("item_id, institution_name, institution_logo, institution_color, accounts, created_at")
    .order("created_at", { ascending: true });

  const items = (data ?? []).map((r: any) => {
    const accts = Array.isArray(r.accounts) ? r.accounts : [];
    return {
      itemId: r.item_id,
      institution: r.institution_name ?? "Institution",
      logo: r.institution_logo ?? null,
      color: r.institution_color ?? null,
      accountCount: accts.length,
      accounts: accts.map((a: any) => ({
        name: a.name,
        mask: a.mask ?? null,
        type: a.type ?? null,
        subtype: a.subtype ?? null,
      })),
    };
  });
  return NextResponse.json({ configured: plaidConfigured(), items });
}
