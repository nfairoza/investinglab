import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface CashRow {
  amount: number | string;
  source?: string | null;
  updated_at?: string | null;
}

function toCash(r: CashRow | null) {
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
  const parsed = await parseBody(req, z.object({ amount: z.coerce.number().optional() }));
  if (!parsed.ok) return parsed.response;
  const amount = Number(parsed.data.amount);
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
