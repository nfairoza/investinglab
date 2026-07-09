import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";
import type { StoredInsight, InsightStatus } from "@/lib/insights/types";
import { rankInsights, applyGovernor } from "@/lib/insights/rank";
import { narrate, fillSlots } from "@/lib/insights/narrate";

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

  let q = ctx.supabase.from("insights").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(100);
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data } = await q;
  let rows = (data ?? []).map(toStored);

  // Home / active feed hides resolved insights.
  if (activeOnly) rows = rows.filter((r) => r.status === "new" || r.status === "seen");
  // Never show dismissed/muted in the default feed (archive can request them).
  else if (!statusFilter) rows = rows.filter((r) => r.status !== "dismissed" && r.status !== "muted");

  const ranked = rankInsights(rows);

  // Frequency governor: count 'new' already surfaced (status seen) today.
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const shownNewToday = rows.filter((r) => r.status === "seen" && Date.parse(r.createdAt) >= startOfDay.getTime()).length;
  const governed = activeOnly ? ranked : applyGovernor(ranked, shownNewToday);

  // Render narration (cheap task, digit-free-validated, template fallback).
  const withText = await Promise.all(governed.map(async (ins) => {
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
