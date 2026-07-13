import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { buildLedger } from "@/lib/insights/ledger/build";
import { loadLedgerInputs } from "@/lib/insights/persist";
import { computeSafeToSpend, buildCashflowCalendar, type IncomeCadence, type UpcomingBill } from "@/lib/money/safe-to-spend";

export const dynamic = "force-dynamic";

const DEFAULT_BUFFER = 200;

// GET /api/money/safe-to-spend — MV1. Deterministic Safe-to-Spend + the 30-day
// cash-flow calendar. Reads the user's ledger (balances, income cadence) + the
// recurring_charges bills (with next_expected). No AI. Cheap enough to compute
// on read; nothing is cached per-user beyond the ledger's own inputs.
//
// PUT /api/money/safe-to-spend — set the user's buffer.
export async function GET(_req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const nowIso = new Date().toISOString().slice(0, 10);

  // Buffer pref (default $200).
  const { data: pref } = await supabase.from("money_prefs").select("safe_buffer").eq("user_id", userId).maybeSingle();
  const buffer = pref?.safe_buffer != null ? Number(pref.safe_buffer) : DEFAULT_BUFFER;

  // Ledger → liquid balance + income streams. (loadLedgerInputs scopes by user;
  // buildLedger derives incomeStreams + flags.)
  const inputs = await loadLedgerInputs(supabase, userId);
  const ledger = buildLedger(inputs);
  const liquidBalance = ledger.balances.filter((b) => b.isLiquid).reduce((s, b) => s + (b.current || 0), 0);

  // Income cadence with a REAL last-deposit date (the ledger's IncomeStream only
  // carries a YYYY-MM lastSeen; we recover the actual last date from the flagged
  // income transactions so the payday math is day-accurate).
  const incomeTxnIds = new Set(ledger.flags.filter((f) => f.isIncome && !f.isTransfer).map((f) => f.transactionId));
  const lastIncomeDate = new Map<string, string>(); // source(merchant/name lower) → latest YYYY-MM-DD
  for (const t of inputs.txns) {
    if (!incomeTxnIds.has(t.transactionId)) continue;
    const key = (t.merchant || t.name || "income").toLowerCase();
    const d = String(t.date).slice(0, 10);
    if (!lastIncomeDate.has(key) || d > lastIncomeDate.get(key)!) lastIncomeDate.set(key, d);
  }
  const income: IncomeCadence[] = ledger.incomeStreams.map((s) => ({
    source: s.source,
    cadence: s.cadence,
    lastDate: lastIncomeDate.get(s.source.toLowerCase()) ?? `${s.lastSeen}-15`,
    avgAmount: s.avgAmount,
  }));

  // Recurring bills with predicted next dates.
  const { data: billRows } = await supabase
    .from("recurring_charges")
    .select("merchant, avg_amount, last_amount, next_expected, status")
    .eq("user_id", userId)
    .eq("status", "active");
  const bills: UpcomingBill[] = (billRows ?? [])
    .filter((b: any) => b.next_expected)
    .map((b: any) => ({
      merchant: b.merchant,
      amount: Number(b.last_amount ?? b.avg_amount) || 0,
      nextExpected: String(b.next_expected).slice(0, 10),
    }));

  const stsInput = { liquidBalance, bills, income, buffer, now: nowIso };
  const result = computeSafeToSpend(stsInput);
  const calendar = buildCashflowCalendar(stsInput, 30);

  return NextResponse.json({ ...result, calendar, defaultBuffer: DEFAULT_BUFFER });
}

export async function PUT(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;
  const body = await req.json().catch(() => ({}));
  const buffer = Number(body?.buffer);
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 100_000) {
    return NextResponse.json({ error: "invalid_buffer" }, { status: 400 });
  }
  const { error } = await supabase.from("money_prefs").upsert(
    { user_id: userId, safe_buffer: buffer, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, buffer });
}
