import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { buildLedger } from "@/lib/insights/ledger/build";
import { loadLedgerInputs } from "@/lib/insights/persist";
import { suggestTargets, targetProgress, type MonthlyCategorySpend } from "@/lib/money/targets";

export const dynamic = "force-dynamic";

// GET /api/money/targets — MV2. Returns the user's saved targets (with month-to-
// date progress + pace) and per-category SUGGESTIONS (p50 of trailing 3 months)
// for categories that aren't targeted yet. Deterministic; no AI.
export async function GET(_req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;

  const inputs = await loadLedgerInputs(supabase, userId);
  const ledger = buildLedger(inputs);

  // Monthly category spend history from the ledger's completed months.
  const history: MonthlyCategorySpend[] = [];
  for (const m of ledger.months) {
    for (const [category, total] of Object.entries(m.byCategory)) {
      if (total > 0) history.push({ month: m.month, category, total });
    }
  }

  // Current-month category spend (MTD) for progress rings.
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  const mtd = new Map<string, number>();
  const cur = ledger.months.find((m) => m.month === curMonth);
  if (cur) for (const [c, v] of Object.entries(cur.byCategory)) mtd.set(c, v);

  const { data: rows } = await supabase.from("category_targets").select("category, monthly_target, suggested_from").eq("user_id", userId);
  const saved = rows ?? [];
  const savedCats = new Set(saved.map((r: any) => r.category));

  const targets = saved.map((r: any) =>
    targetProgress(r.category, Number(r.monthly_target), mtd.get(r.category) ?? 0, dayOfMonth, daysInMonth),
  );

  // Suggestions only for categories the user hasn't targeted yet.
  const suggestions = suggestTargets(history, { months: 3, minMonths: 2 }).filter((s) => !savedCats.has(s.category));

  return NextResponse.json({ targets, suggestions, month: curMonth });
}

// POST /api/money/targets — accept/edit a target. { category, monthlyTarget, suggestedFrom? }
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const body = await req.json().catch(() => ({}));
  const category = String(body?.category ?? "").trim();
  const monthlyTarget = Number(body?.monthlyTarget);
  if (!category || !Number.isFinite(monthlyTarget) || monthlyTarget <= 0 || monthlyTarget > 1_000_000) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { error } = await supabase.from("category_targets").upsert({
    user_id: userId, category, monthly_target: monthlyTarget,
    suggested_from: body?.suggestedFrom != null ? Number(body.suggestedFrom) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,category" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/money/targets?category=Dining — remove a target.
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const category = (req.nextUrl.searchParams.get("category") ?? "").trim();
  if (!category) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await supabase.from("category_targets").delete().eq("user_id", userId).eq("category", category);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
