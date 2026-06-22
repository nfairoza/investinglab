import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

function toCash(r: any) {
  return r
    ? { amount: Number(r.amount), source: r.source ?? "manual", updatedAt: r.updated_at ?? null }
    : { amount: 0, source: "manual" as const, updatedAt: null };
}

export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("cash").select("*").maybeSingle();
  return NextResponse.json(toCash(data));
}

// PUT { amount } — set available cash manually (one row per user, upsert).
export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }
  const { data } = await ctx.supabase.from("cash").upsert({
    user_id: ctx.userId,
    amount: +amount.toFixed(2),
    source: "manual",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).select("*").maybeSingle();
  return NextResponse.json(toCash(data));
}
