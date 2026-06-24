import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { syncFmpCongress } from "@/lib/power-trades/sync";

export const dynamic = "force-dynamic";

// POST /api/power-trades/sync — admin-only. Runs the FMP congressional sync into
// Supabase. (Other sources are stubbed/disabled this phase.) Intended to be hit
// by an admin button or a scheduled job — never on user render.
export async function POST() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await syncFmpCongress();
  return NextResponse.json({ ok: result.errors === 0, ...result });
}
