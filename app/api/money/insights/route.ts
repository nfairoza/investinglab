import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { computeMoneyInsights } from "@/lib/money/insights";

export const dynamic = "force-dynamic";

// GET /api/money/insights — deterministic spending anomalies, recurring-bill
// price changes, and variable-bill trends from the user's own transaction
// history. No AI tokens spent; the math is exact.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const insights = await computeMoneyInsights(ctx);
  return NextResponse.json(insights);
}
