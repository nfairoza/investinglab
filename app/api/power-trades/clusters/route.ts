import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/clusters — PT5. Detected insider clusters (3+ distinct
// insiders buying the same issuer within 30d), most-recent window first. Reads
// only the local insider_clusters table (nightly-built). Optional ?issuer= to
// expand one; the individual Form 4s are joined from power_trade_records.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ rows: [], note: "not_configured" });

  const issuer = (req.nextUrl.searchParams.get("issuer") ?? "").trim().toUpperCase();

  let query = sb.from("insider_clusters").select("*").order("window_end", { ascending: false }).limit(200);
  if (issuer) query = query.eq("issuer", issuer);
  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });
  const clusters = data ?? [];

  // When expanding a single issuer, attach the individual Form 4 buys in the
  // cluster window so the UI can list them.
  if (issuer && clusters.length > 0) {
    const ids: string[] = (clusters[0] as any).trade_ids ?? [];
    if (ids.length > 0) {
      const { data: trades } = await sb
        .from("power_trade_records")
        .select("id,person_name,person_role,transaction_date,disclosure_date,amount_label,source_url")
        .in("id", ids)
        .order("transaction_date", { ascending: false });
      return NextResponse.json({ rows: clusters, trades: trades ?? [] });
    }
  }
  return NextResponse.json({ rows: clusters });
}
