import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";
import type { StoredInsight, InsightStatus } from "@/lib/insights/types";
import { applyGovernorPrecise } from "@/lib/insights/rank";
import { narrate, fillSlots } from "@/lib/insights/narrate";
import {
  rankWithFeedback, isKindMuted, recordNotForMe, recordSurfaced, surfacedIdsToday,
  type InsightFeedback, type SurfacedLedger,
} from "@/lib/insights/feedback";

async function readInsightPrefs(supabase: SupabaseClient): Promise<{ feedback: InsightFeedback; surfaced: SurfacedLedger | null; prefs: Record<string, unknown> }> {
  const { data } = await supabase.from("user_prefs").select("prefs").maybeSingle();
  const prefs = (data?.prefs as Record<string, unknown>) ?? {};
  return {
    feedback: (prefs.insightFeedback as InsightFeedback) ?? {},
    surfaced: (prefs.insightSurfaced as SurfacedLedger) ?? null,
    prefs,
  };
}

export const dynamic = "force-dynamic";

function toStored(r: any): StoredInsight {
  return {
    id: String(r.id), kind: r.kind, subject: r.subject ?? "", severity: r.severity,
    slots: (r.slots ?? {}) as Record<string, number | string>,
    impactPerYear: r.impact_year ?? null, evidence: (r.evidence ?? []) as StoredInsight["evidence"],
    status: r.status as InsightStatus, positive: Boolean(r.positive),
    action: r.action ?? null, createdAt: r.created_at,
  };
}

// GET — the ranked, governed insight feed for the current user, with narration
// rendered (numbers slotted from the row, prose validated to be digit-free).
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status"); // optional archive filter
  const activeOnly = url.searchParams.get("active") === "1"; // Home cards

  const now = Date.now();
  const { feedback, surfaced, prefs } = await readInsightPrefs(ctx.supabase);

  let q = ctx.supabase.from("insights").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(100);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data } = await q;
  let rows = (data ?? []).map(toStored);

  // Home / active feed hides resolved insights.
  if (activeOnly) rows = rows.filter((r) => r.status === "new" || r.status === "seen");
  // Never show dismissed/muted in the default feed (archive can request them).
  else if (!statusFilter) rows = rows.filter((r) => r.status !== "dismissed" && r.status !== "muted");

  // Feedback: hide kinds the user muted ("not for me") within their 90-day
  // window. Severity-3 safety insights ignore the mute. The archive (statusFilter)
  // still shows everything.
  if (!statusFilter) rows = rows.filter((r) => r.severity === 3 || !isKindMuted(feedback, r.kind, now));

  // Rank with feedback-aware downweight (repeatedly dismissed kinds sink).
  const ranked = rankWithFeedback(rows, feedback);

  // Precise governor: count the exact insights surfaced today (idempotent across
  // revalidations), not a createdAt proxy. Home/active feed isn't governed.
  const alreadySurfaced = surfacedIdsToday(surfaced, now);
  const { visible, newlySurfaced } = activeOnly
    ? { visible: ranked, newlySurfaced: [] as string[] }
    : applyGovernorPrecise(ranked, alreadySurfaced, now);

  // Persist newly-surfaced ids so tomorrow's budget and idempotency hold.
  if (newlySurfaced.length) {
    const nextLedger = recordSurfaced(surfaced, newlySurfaced, now);
    await ctx.supabase.from("user_prefs").upsert(
      { user_id: ctx.userId, prefs: { ...prefs, insightSurfaced: nextLedger }, updated_at: new Date(now).toISOString() },
      { onConflict: "user_id" },
    ).then(() => {}, () => {});
  }

  // Render narration (cheap task, digit-free-validated, template fallback).
  const withText = await Promise.all(visible.map(async (ins) => {
    const { headline, body } = await narrate(ins);
    return { ...ins, headline: fillSlots(headline, ins.slots), body: fillSlots(body, ins.slots) };
  }));

  return NextResponse.json({ insights: withText });
}

// PATCH — update one insight's status (seen/done/dismissed/muted). Dismiss/mute
// anywhere suppresses everywhere because every surface reads this same feed.
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, z.object({
    id: z.string().uuid(),
    status: z.enum(["new", "seen", "done", "dismissed", "muted"]),
  }));
  if (!parsed.ok) return parsed.response;

  const { id, status } = parsed.data;
  const { error } = await ctx.supabase.from("insights")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", ctx.userId);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  // Feedback: "not for me" (muted) mutes the whole KIND for 90 days and
  // downweights its ordering thereafter. Recorded per-kind in user_prefs.
  if (status === "muted") {
    const { data: ins } = await ctx.supabase.from("insights").select("kind").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
    if (ins?.kind) {
      const { feedback, prefs } = await readInsightPrefs(ctx.supabase);
      const nextFeedback = recordNotForMe(feedback, ins.kind, Date.now());
      await ctx.supabase.from("user_prefs").upsert(
        { user_id: ctx.userId, prefs: { ...prefs, insightFeedback: nextFeedback }, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      ).then(() => {}, () => {});
    }
  }

  // Closure loop: "I did this" (done) records an outcome in the trust ledger.
  // The captured $/yr is the insight's own flagged impact (the user committed to
  // the opportunity we surfaced). Detected outcomes are written by the nightly
  // job instead. Idempotent via the unique (user, insight_id).
  if (status === "done") {
    const { data: ins } = await ctx.supabase.from("insights")
      .select("kind, subject, impact_year, positive").eq("id", id).eq("user_id", ctx.userId).maybeSingle();
    if (ins && !ins.positive && ins.impact_year != null) {
      await ctx.supabase.from("insight_outcomes").upsert({
        user_id: ctx.userId, insight_id: id, kind: ins.kind, subject: ins.subject ?? "",
        source: "user", flagged_year: ins.impact_year, captured_year: ins.impact_year,
        note: "You marked this done.",
      }, { onConflict: "user_id,insight_id" });
    }
  }
  return NextResponse.json({ ok: true });
}
