import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/insights/outcomes — the trust ledger: running totals of what rukMoney
// flagged vs what the user captured, plus recent captured outcomes. Powers the
// "flagged $X/yr; you've captured $Y" card on /insights.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: outcomes } = await ctx.supabase.from("insight_outcomes")
    .select("kind, subject, source, flagged_year, captured_year, note, created_at")
    .order("created_at", { ascending: false }).limit(50);
  const rows = outcomes ?? [];
  const captured = +rows.reduce((s: number, r: any) => s + (Number(r.captured_year) || 0), 0).toFixed(2);

  // "Flagged" = total opportunity we've surfaced: sum of impact_year across all
  // non-positive insights ever generated for this user (the denominator).
  const { data: flaggedRows } = await ctx.supabase.from("insights")
    .select("impact_year").eq("user_id", ctx.userId).eq("positive", false).not("impact_year", "is", null);
  const flagged = +(flaggedRows ?? []).reduce((s: number, r: any) => s + (Number(r.impact_year) || 0), 0).toFixed(2);

  return NextResponse.json({
    flaggedYear: flagged,
    capturedYear: captured,
    count: rows.length,
    recent: rows.slice(0, 8).map((r: any) => ({
      kind: r.kind, subject: r.subject, source: r.source,
      capturedYear: Number(r.captured_year) || 0, note: r.note, createdAt: r.created_at,
    })),
  });
}
