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
    .select("created_at, provider, model, input_tokens, output_tokens, cached_input_tokens, ok, feature, task")
    .gte("created_at", since)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  type Group = Record<string, { calls: number; costUsd: number }>;
  const emptyBucket = () => ({ calls: 0, costUsd: 0, cachedInputTokens: 0, inputTokens: 0, byProvider: {} as Group, byFeature: {} as Group });
  const summary = { day: emptyBucket(), week: emptyBucket() };

  const bump = (g: Group, key: string, cost: number) => {
    const e = g[key] ?? { calls: 0, costUsd: 0 };
    e.calls += 1; e.costUsd += cost; g[key] = e;
  };

  for (const r of data ?? []) {
    const cost = estimateCostUsd(r.model ?? "", Number(r.input_tokens) || 0, Number(r.output_tokens) || 0);
    const inDay = new Date(r.created_at).getTime() >= dayAgo;
    const prov = r.provider ?? "unknown";
    // feature is the product-surface label (AIEFF4); fall back to task, then unknown,
    // so older rows written before the column existed still bucket somewhere.
    const feat = (r as any).feature ?? (r as any).task ?? "unknown";
    const cached = Number((r as any).cached_input_tokens) || 0;
    const input = Number(r.input_tokens) || 0;
    for (const bucket of inDay ? [summary.day, summary.week] : [summary.week]) {
      bucket.calls += 1;
      bucket.costUsd += cost;
      bucket.cachedInputTokens += cached;   // A2: prompt-cache reads (billed ~10%)
      bucket.inputTokens += input;
      bump(bucket.byProvider, prov, cost);
      bump(bucket.byFeature, feat, cost);
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  for (const b of [summary.day, summary.week]) {
    b.costUsd = round(b.costUsd);
    for (const g of [b.byProvider, b.byFeature]) for (const e of Object.values(g)) e.costUsd = round(e.costUsd);
  }

  // A2: cache hit-rate = cached input tokens / total input tokens (chat only has
  // caching today, but this measures it fleet-wide).
  const hitRate = (b: { cachedInputTokens: number; inputTokens: number }) =>
    b.inputTokens > 0 ? Math.round((b.cachedInputTokens / b.inputTokens) * 100) : 0;

  return NextResponse.json({
    ...summary,
    cacheHitRate: { day: hitRate(summary.day), week: hitRate(summary.week) },
  });
}
