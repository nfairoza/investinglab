import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { summarizeTimings } from "@/lib/percentile";

export const dynamic = "force-dynamic";

// GET /api/admin/nav-timing — admin-only. Reads the last 7 days of nav-timing
// beacons from error_log (section "perf", meta.kind "nav-timing") and returns
// per-route p50/p95 of click→first-contentful-render latency (SMOOTH S5). Same
// service-role + admin-at-the-API pattern as the AI-cost card.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 200 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("error_log")
    .select("meta, created_at")
    .eq("section", "perf")
    .gte("created_at", since)
    .limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const samples: Array<{ route: string; ms: number }> = [];
  for (const r of data ?? []) {
    const m = (r as any).meta as { kind?: string; route?: string; ms?: number } | null;
    if (!m || m.kind !== "nav-timing" || typeof m.ms !== "number" || !m.route) continue;
    samples.push({ route: m.route, ms: m.ms });
  }

  const routes = summarizeTimings(samples);
  return NextResponse.json({ routes, totalSamples: samples.length });
}
