import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { fmpHealth } from "@/lib/providers/fmp";

export const dynamic = "force-dynamic";

// GET /api/connectors/health — admin-only provider-health strip (P3.3).
// Per-instance, best-effort: last success, last error, today's actual FMP call
// count (cache hits excluded). Resets on serverless cold start.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ fmp: fmpHealth() });
}
