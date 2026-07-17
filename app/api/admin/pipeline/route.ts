import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase-data";
import { JOBS } from "@/lib/cron/jobs";
import { getJobStatuses } from "@/lib/cron/registry";

export const dynamic = "force-dynamic";

// GET /api/admin/pipeline — admin-only. Per-job cron last-run status (from
// server_cache) + aggregate Plaid per-item sync health. Read-only inspection.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const jobs = await getJobStatuses(JOBS);

  // Plaid item sync health, aggregated across all users (service role).
  let plaid = { total: 0, active: 0, reauthRequired: 0, staleOver48h: 0, neverSynced: 0 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) {
    const sb = createServiceClient(url, key, { auth: { persistSession: false } });
    const { data } = await sb.from("plaid_items").select("status, last_synced_at").limit(50_000);
    const now = Date.now();
    const STALE = 48 * 60 * 60 * 1000;
    for (const r of data ?? []) {
      plaid.total++;
      if ((r as any).status === "reauth_required") plaid.reauthRequired++; else plaid.active++;
      const ls = (r as any).last_synced_at ? new Date((r as any).last_synced_at).getTime() : null;
      if (ls == null) plaid.neverSynced++;
      else if (now - ls > STALE) plaid.staleOver48h++;
    }
  }

  return NextResponse.json({ jobs, plaid, now: Date.now() });
}
