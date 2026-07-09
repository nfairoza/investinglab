import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { z } from "zod";

export const dynamic = "force-dynamic";

// GET /api/recurring — the user's detected recurring charges (active first).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await ctx.supabase.from("recurring_charges")
    .select("merchant, cadence, avg_amount, last_amount, last_seen, status")
    .order("avg_amount", { ascending: false });
  const rows = (data ?? []).map((r: any) => ({
    merchant: r.merchant, cadence: r.cadence, avgAmount: Number(r.avg_amount), lastAmount: Number(r.last_amount),
    lastSeen: r.last_seen, status: r.status, priceIncrease: Number(r.last_amount) > Number(r.avg_amount) * 1.1,
  }));
  const active = rows.filter((r: any) => r.status !== "dismissed");
  const monthlyTotal = +active.reduce((s: number, c: any) => s + (c.cadence === "monthly" ? c.avgAmount : c.avgAmount / 12), 0).toFixed(2);
  return NextResponse.json({ recurring: rows, monthlyTotal });
}

// PATCH /api/recurring — mark a merchant not-recurring (dismiss) or restore.
export async function PATCH(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({
    merchant: z.string().min(1),
    status: z.enum(["active", "dismissed"]),
  }));
  if (!parsed.ok) return parsed.response;
  await ctx.supabase.from("recurring_charges")
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId).eq("merchant", parsed.data.merchant);
  return NextResponse.json({ ok: true });
}
