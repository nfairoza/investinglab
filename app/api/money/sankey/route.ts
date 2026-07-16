import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { buildLedger } from "@/lib/insights/ledger/build";
import { loadLedgerInputs } from "@/lib/insights/persist";
import { categorize } from "@/lib/money/categorize";
import { buildSankey, type SankeyTxn, type SankeyIncomeStream } from "@/lib/money/sankey";

export const dynamic = "force-dynamic";

// GET /api/money/sankey?from=YYYY-MM-DD&to=YYYY-MM-DD — cash-flow Sankey for the
// period. Reuses the ledger (per-txn transfer/income flags + income streams), so
// transfers and credit-card payments are excluded exactly as everywhere else.
// Deterministic; no AI. The savings band uses the ledger's savings_flow for the
// months in range so it reconciles with the Money dashboard.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase, userId } = ctx;

  const from = (req.nextUrl.searchParams.get("from") ?? "0000-01-01").slice(0, 10);
  const to = (req.nextUrl.searchParams.get("to") ?? "9999-12-31").slice(0, 10);

  const inputs = await loadLedgerInputs(supabase, userId);
  const ledger = buildLedger(inputs);

  // Per-txn flags by id (isTransfer / isIncome derived by the ledger).
  const flagById = new Map(ledger.flags.map((f) => [f.transactionId, f]));

  // Overrides win for category (mirrors the spending view).
  const catOverride = new Map(inputs.overrides.filter((o) => o.category).map((o) => [o.transactionId, o.category as string]));

  const txns: SankeyTxn[] = inputs.txns
    .filter((t) => !t.removed && t.date >= from && t.date <= to)
    .map((t) => {
      const f = flagById.get(t.transactionId);
      return {
        transactionId: t.transactionId,
        date: t.date,
        merchant: t.merchant,
        name: t.name,
        amount: t.amount,
        category: catOverride.get(t.transactionId) ?? categorize({ merchant: t.merchant, name: t.name, plaidDetailed: t.plaidDetailed, plaidPrimary: t.plaidCategory }),
        isTransfer: Boolean(f?.isTransfer),
        isIncome: Boolean(f?.isIncome),
      };
    });

  // Savings for the period = sum of ledger_month.savingsFlow for months in range.
  const monthsInRange = ledger.months.filter((m) => `${m.month}-01` >= from.slice(0, 7) + "-01" && m.month <= to.slice(0, 7));
  const savingsFlow = monthsInRange.reduce((s, m) => s + m.savingsFlow, 0);

  const streams: SankeyIncomeStream[] = ledger.incomeStreams.map((s) => ({ source: s.source, matchKey: s.source }));

  const graph = buildSankey(txns, streams, savingsFlow);
  return NextResponse.json({ ...graph, asOf: ledger.asOf, from, to });
}
