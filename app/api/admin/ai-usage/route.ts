import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { serviceClient } from "@/lib/service-client";
import { estimateCostUsd } from "@/lib/ai/usage";

export const dynamic = "force-dynamic";

// GET /api/admin/ai-usage — admin-only AI cost summary for the last 24h and 7d,
// broken down by provider, with an estimated USD spend. Reads via the service
// role (ai_usage has no RLS policies); admin enforced here.
export async function GET() {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "not_configured" }, { status: 200 });

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("ai_usage")
    .select("created_at, provider, model, input_tokens, output_tokens, ok")
    .gte("created_at", since)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const summary = {
    day: { calls: 0, costUsd: 0, byProvider: {} as Record<string, { calls: number; costUsd: number }> },
    week: { calls: 0, costUsd: 0, byProvider: {} as Record<string, { calls: number; costUsd: number }> },
  };

  for (const r of data ?? []) {
    const cost = estimateCostUsd(r.model ?? "", Number(r.input_tokens) || 0, Number(r.output_tokens) || 0);
    const inDay = new Date(r.created_at).getTime() >= dayAgo;
    const prov = r.provider ?? "unknown";
    for (const bucket of inDay ? [summary.day, summary.week] : [summary.week]) {
      bucket.calls += 1;
      bucket.costUsd += cost;
      const bp = bucket.byProvider[prov] ?? { calls: 0, costUsd: 0 };
      bp.calls += 1; bp.costUsd += cost;
      bucket.byProvider[prov] = bp;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  summary.day.costUsd = round(summary.day.costUsd);
  summary.week.costUsd = round(summary.week.costUsd);
  for (const b of [summary.day, summary.week]) for (const p of Object.values(b.byProvider)) p.costUsd = round(p.costUsd);

  return NextResponse.json(summary);
}
