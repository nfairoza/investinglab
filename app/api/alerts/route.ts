import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import type { Alert } from "@/lib/db";

export const dynamic = "force-dynamic";

function toAlert(r: any): Alert {
  return {
    id: r.id,
    symbol: r.symbol,
    type: r.type,
    direction: r.direction ?? undefined,
    price: r.price ?? undefined,
    movePct: r.move_pct ?? undefined,
    withinDays: r.within_days ?? undefined,
    scoreOp: r.score_op ?? undefined,
    scoreValue: r.score_value ?? undefined,
    note: r.note ?? undefined,
    enabled: r.enabled,
    expiresAt: r.expires_at ?? undefined,
    lastTriggeredAt: r.last_triggered_at ?? undefined,
    lastValue: r.last_value ?? undefined,
    triggerCount: r.trigger_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Drop time-bound alerts whose expiry has passed. Best-effort: a failed delete
// just means they get cleaned up on a later read.
async function pruneExpired(ctx: { supabase: any }) {
  try {
    await ctx.supabase.from("alerts").delete().not("expires_at", "is", null).lt("expires_at", new Date().toISOString());
  } catch { /* ignore — listing still filters below */ }
}

async function listAlerts(ctx: { supabase: any }) {
  await pruneExpired(ctx);
  const { data } = await ctx.supabase.from("alerts").select("*").order("created_at", { ascending: false });
  const nowMs = Date.now();
  // Belt-and-suspenders: also filter client-visible list in case the prune lagged.
  return (data ?? [])
    .map(toAlert)
    .filter((a: Alert) => !a.expiresAt || new Date(a.expiresAt).getTime() > nowMs);
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listAlerts(ctx));
}

export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase().trim();
  const type = body?.type as Alert["type"];
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  if (!["price", "dayMove", "earnings", "score"].includes(type)) {
    return NextResponse.json({ error: "valid type required" }, { status: 400 });
  }
  if (type === "price" && !(Number(body.price) > 0)) return NextResponse.json({ error: "price required" }, { status: 400 });
  if (type === "dayMove" && !(Number(body.movePct) > 0)) return NextResponse.json({ error: "movePct required" }, { status: 400 });
  if (type === "earnings" && !(Number(body.withinDays) >= 0)) return NextResponse.json({ error: "withinDays required" }, { status: 400 });
  if (type === "score" && !(Number(body.scoreValue) >= 0)) return NextResponse.json({ error: "scoreValue required" }, { status: 400 });

  // Optional expiry: must be a valid timestamp in the future. Anything else is
  // treated as "no expiry" (persistent alert) rather than rejected.
  let expiresAt: string | null = null;
  if (body.expiresAt) {
    const t = new Date(body.expiresAt).getTime();
    if (Number.isFinite(t)) {
      if (t <= Date.now()) return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
      expiresAt = new Date(t).toISOString();
    }
  }

  await ctx.supabase.from("alerts").insert({
    user_id: ctx.userId,
    symbol,
    type,
    direction: type === "price" ? (body.direction === "above" ? "above" : "below") : null,
    price: type === "price" ? Number(body.price) : null,
    move_pct: type === "dayMove" ? Number(body.movePct) : null,
    within_days: type === "earnings" ? Number(body.withinDays) : null,
    score_op: type === "score" ? (body.scoreOp === "above" ? "above" : "below") : null,
    score_value: type === "score" ? Number(body.scoreValue) : null,
    note: body.note ? String(body.note) : null,
    expires_at: expiresAt,
    enabled: true,
    trigger_count: 0,
  });
  return NextResponse.json(await listAlerts(ctx));
}

// PATCH { id, enabled?, trigger?: { value, at } }
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  // expiresAt: a valid future ISO string sets/extends it; null clears it (make persistent).
  if (body.expiresAt === null) {
    patch.expires_at = null;
  } else if (body.expiresAt) {
    const t = new Date(body.expiresAt).getTime();
    if (!Number.isFinite(t)) return NextResponse.json({ error: "invalid expiresAt" }, { status: 400 });
    if (t <= Date.now()) return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
    patch.expires_at = new Date(t).toISOString();
  }
  if (body.trigger && typeof body.trigger.value === "number") {
    patch.last_triggered_at = body.trigger.at ?? new Date().toISOString();
    patch.last_value = body.trigger.value;
    // Read current count to increment (no atomic increment via PostgREST here).
    const { data: cur } = await ctx.supabase.from("alerts").select("trigger_count").eq("id", id).maybeSingle();
    patch.trigger_count = (cur?.trigger_count ?? 0) + 1;
  }
  const { data, error } = await ctx.supabase.from("alerts").update(patch).eq("id", id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(toAlert(data));
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ctx.supabase.from("alerts").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
