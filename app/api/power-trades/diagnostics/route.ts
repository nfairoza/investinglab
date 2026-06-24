import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { sourceRegistry, powerServiceClient, fmpKey } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// GET /api/power-trades/diagnostics — ADMIN ONLY. Source diagnostics:
// provider, FMP key configured, rows by source, House/Senate counts,
// missing-ticker count, parser failures, top unmapped names, last run/error.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ error: "not_configured" });

  const [{ data: bySourceRows }, { data: chambers }, noTicker, rawFailed, { data: runs }, { data: srcStatus }] = await Promise.all([
    sb.from("power_trade_records").select("source"),
    sb.from("power_trade_records").select("chamber_or_branch"),
    sb.from("power_trade_records").select("id", { count: "exact", head: true }).is("ticker", null),
    sb.from("power_disclosures_raw").select("id", { count: "exact", head: true }).eq("parse_status", "failed"),
    sb.from("power_source_sync_runs").select("*").order("started_at", { ascending: false }).limit(10),
    sb.from("power_sources").select("*"),
  ]);

  const count = (rows: any[] | null, key: string) => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) m[r[key] ?? "unknown"] = (m[r[key] ?? "unknown"] ?? 0) + 1;
    return m;
  };

  // Top unmapped names = trade rows with no person_id linked.
  const { data: unmapped } = await sb.from("power_trade_records").select("person_name").is("person_id", null).limit(500);
  const unmappedCounts = count(unmapped ?? [], "person_name");
  const topUnmapped = Object.entries(unmappedCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, count: n }));

  const { count: totalTrades } = await sb.from("power_trade_records").select("id", { count: "exact", head: true });
  const { count: totalPeople } = await sb.from("power_people").select("id", { count: "exact", head: true });

  return NextResponse.json({
    provider: process.env.POWER_TRADES_PROVIDER || "fmp",
    fmpKeyConfigured: Boolean(fmpKey()),
    registry: sourceRegistry().map((d) => ({ source: d.source, label: d.label, built: d.built, enabled: d.built && d.enabled })),
    totals: { trades: totalTrades ?? 0, people: totalPeople ?? 0 },
    rowsBySource: count(bySourceRows ?? [], "source"),
    chambers: count(chambers ?? [], "chamber_or_branch"),
    missingTicker: noTicker.count ?? 0,
    parserFailures: rawFailed.count ?? 0,
    topUnmapped,
    sources: srcStatus ?? [],
    runs: runs ?? [],
  });
}
