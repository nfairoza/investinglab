import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { buildLedger } from "@/lib/insights/ledger/build";
import { loadLedgerInputs } from "@/lib/insights/persist";
import { suggestTargets, targetProgress, type MonthlyCategorySpend } from "@/lib/money/targets";

export const dynamic = "force-dynamic";

// GET /api/money/budgets — H1. The user's active PERSONAL budgets (with MTD
// progress + pace) plus per-category SUGGESTIONS (p50 of the trailing 3 months)
// for categories that aren't budgeted yet. Deterministic; reuses the MV2 math.
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

  // Current-month category spend (MTD) for the progress bars.
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  const mtd = new Map<string, number>();
  const cur = ledger.months.find((m) => m.month === curMonth);
  if (cur) for (const [c, v] of Object.entries(cur.byCategory)) mtd.set(c, v);

  const { data: rows } = await supabase
    .from("budgets")
    .select("id, category, monthly_amount, suggested_from")
    .eq("owner_id", userId).eq("scope", "personal").eq("status", "active");
  const saved = rows ?? [];
  const savedCats = new Set(saved.map((r: any) => r.category));

  const budgets = saved.map((r: any) => ({
    id: String(r.id),
    ...targetProgress(r.category, Number(r.monthly_amount), mtd.get(r.category) ?? 0, dayOfMonth, daysInMonth),
    suggestedFrom: r.suggested_from != null ? Number(r.suggested_from) : null,
  }));

  // Suggestions only for categories the user hasn't budgeted yet.
  const suggestions = suggestTargets(history, { months: 3, minMonths: 2 }).filter((s) => !savedCats.has(s.category));

  return NextResponse.json({ budgets, suggestions, month: curMonth });
}

// POST /api/money/budgets — create/edit a budget. { category, monthlyAmount, suggestedFrom? }
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const body = await req.json().catch(() => ({}));
  const category = String(body?.category ?? "").trim();
  const monthlyAmount = Number(body?.monthlyAmount);
  if (!category || !Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || monthlyAmount > 1_000_000) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  // Upsert the ACTIVE budget for this category. No onConflict target (the unique
  // index is partial), so update-if-exists is done explicitly.
  const { data: existing } = await supabase
    .from("budgets").select("id")
    .eq("owner_id", userId).eq("scope", "personal").eq("category", category).eq("status", "active")
    .maybeSingle();
  const patch = {
    monthly_amount: monthlyAmount,
    suggested_from: body?.suggestedFrom != null ? Number(body.suggestedFrom) : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing?.id
    ? await supabase.from("budgets").update(patch).eq("id", existing.id)
    : await supabase.from("budgets").insert({ scope: "personal", owner_id: userId, category, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/money/budgets?category=Dining — archive a budget (soft delete so
// the category can be re-budgeted and history is retained).
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const category = (req.nextUrl.searchParams.get("category") ?? "").trim();
  if (!category) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await supabase.from("budgets")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("owner_id", userId).eq("scope", "personal").eq("category", category).eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
