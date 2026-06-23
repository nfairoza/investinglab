import { NextResponse } from "next/server";
import { plaidConfigured, plaidEnv, plaidItemCap, plaidItemsEverCreated } from "@/lib/plaid";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/plaid/admin-status — admin-only. Real numbers for the connectors page:
// whether Plaid is configured, which environment, and app-wide connection usage
// (Items ever created vs the cap). 403 for non-admins.
export async function GET() {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const used = await plaidItemsEverCreated();
  const cap = plaidItemCap();
  return NextResponse.json({
    configured: plaidConfigured(),
    env: plaidEnv(),
    used,
    cap,
    nearCap: cap > 0 && used / cap >= 0.8,
    atCap: used >= cap,
  });
}
