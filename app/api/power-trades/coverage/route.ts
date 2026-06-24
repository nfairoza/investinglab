import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { sourceRegistry, powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/coverage — public-ish (authed) source status for the
// Source Coverage page. Shows which sources are enabled/built + last sync.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const reg = sourceRegistry();
  const sb = powerServiceClient();
  let statusBySource: Record<string, { last_sync_at: string | null; last_error: string | null }> = {};
  if (sb) {
    const { data } = await sb.from("power_sources").select("source,last_sync_at,last_error");
    for (const r of data ?? []) statusBySource[r.source] = { last_sync_at: r.last_sync_at, last_error: r.last_error };
  }
  const sources = reg.map((d) => ({
    source: d.source, label: d.label, built: d.built, enabled: d.built && d.enabled,
    lastSyncAt: statusBySource[d.source]?.last_sync_at ?? null,
  }));
  return NextResponse.json({ sources });
}
