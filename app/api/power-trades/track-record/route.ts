import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/track-record?person=<name> — PT3. Returns the nightly-
// computed excess-vs-SPY stats for a person's disclosed buys, per window. Reads
// only the local power_track_records table (never computes on request). Resolves
// the person by name → id first (the directory keys on name).
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ windows: [], note: "not_configured" });

  const name = (req.nextUrl.searchParams.get("person") ?? "").trim();
  if (!name) return NextResponse.json({ windows: [] });

  const { data: person } = await sb
    .from("power_people")
    .select("id")
    .ilike("canonical_name", name)
    .limit(1)
    .maybeSingle();
  if (!person) return NextResponse.json({ windows: [] });

  const { data, error } = await sb
    .from("power_track_records")
    .select("window_days,n,mean_excess_pct,median_excess_pct,win_rate_pct,excesses,computed_at")
    .eq("person_id", (person as any).id)
    .order("window_days", { ascending: true });
  if (error) return NextResponse.json({ windows: [], error: error.message }, { status: 500 });

  return NextResponse.json({ windows: data ?? [] });
}
