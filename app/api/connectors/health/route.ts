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
  // fmpHealth() now includes byFeature (e.g. { map: N, app: M }) so the strip
  // shows the Stock Map's actual daily FMP consumption vs the plan limit.
  return NextResponse.json({ fmp: fmpHealth() });
}
