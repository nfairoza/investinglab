import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { buildLedger } from "@/lib/insights/ledger/build";
import { loadLedgerInputs } from "@/lib/insights/persist";
import { projectGoal, trailingFundingRate } from "@/lib/money/goals";

export const dynamic = "force-dynamic";

// GET /api/money/goals — MV3. The user's savings goals with deterministic,
// cash-flow-only projections (trailing 3-month savings flow → completion date +
// the +$X/mo gap lever). No market-return assumption. No AI.
export async function GET(_req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const now = new Date().toISOString().slice(0, 10);

  const inputs = await loadLedgerInputs(supabase, userId);
  const ledger = buildLedger(inputs);
  // Funding = trailing 3-month savings flow (completed months only).
  const monthlySavings = ledger.months.map((m) => m.savingsFlow);
  const funding = trailingFundingRate(monthlySavings, 3);
  // Current progress proxy: cumulative savings flow since the goal was created,
  // approximated as liquid savings balance (the pool goals draw from). For an
  // account-linked goal we use that account's balance.
  const savingsBalance = ledger.balances.filter((b) => b.isLiquid).reduce((s, b) => s + (b.current || 0), 0);

  const { data: rows } = await supabase.from("goals").select("*").eq("user_id", userId).eq("status", "active").order("target_date", { ascending: true });
  const goals = (rows ?? []).map((g: any) => {
    const investmentLinked = g.linked_kind === "account";
    let currentAmount = 0;
    if (investmentLinked && g.account_id) {
      const acct = ledger.balances.find((b) => b.accountId === g.account_id);
      currentAmount = acct?.current ?? 0;
    } else {
      // savings_flow goals: progress toward target from the shared savings pool,
      // capped at the target (we don't claim the whole balance belongs to one goal).
      currentAmount = Math.min(savingsBalance, Number(g.target_amount));
    }
    const projection = projectGoal({
      targetAmount: Number(g.target_amount),
      targetDate: g.target_date ?? null,
      currentAmount,
      monthlyFunding: funding,
      now,
    });
    return {
      id: g.id, name: g.name, targetAmount: Number(g.target_amount), targetDate: g.target_date,
      linkedKind: g.linked_kind, currentAmount: Math.round(currentAmount * 100) / 100,
      investmentLinked, projection,
    };
  });

  return NextResponse.json({ goals, monthlyFunding: funding });
}

// POST /api/money/goals — create/update. { id?, name, targetAmount, targetDate?, linkedKind?, accountId? }
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const b = await req.json().catch(() => ({}));
  const name = String(b?.name ?? "").trim();
  const targetAmount = Number(b?.targetAmount);
  if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const linkedKind = b?.linkedKind === "account" ? "account" : "savings_flow";
  const row: any = {
    user_id: userId, name, target_amount: targetAmount,
    target_date: b?.targetDate || null, linked_kind: linkedKind,
    account_id: linkedKind === "account" ? (b?.accountId ?? null) : null,
    updated_at: new Date().toISOString(),
  };
  if (b?.id) row.id = b.id;
  const { data, error } = await supabase.from("goals").upsert(row).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

// DELETE /api/money/goals?id=... — archive a goal.
export async function DELETE(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await supabase.from("goals").update({ status: "archived", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
