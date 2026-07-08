import type { Ledger, LedgerInputs, LedgerMonth, TxnFlag, LedgerTxn, TxnOverride } from "../types";
import { categorize } from "@/lib/money/categorize";
import { detectTransfers } from "./transfers";
import { detectIncome } from "./income";
import { classifyObligations } from "./obligations";

// =============================================================================
// buildLedger — the pure, unit-tested heart of Layer 1. Given the user's raw
// inputs it produces the normalized household truth: per-transaction flags
// (transfer / income / obligation), recurring income streams, and per-month
// income/fixed/discretionary/savings rollups. No I/O, no AI, injectable `now`.
// The nightly job (lib/insights/run.ts) loads inputs, calls this, writes outputs.
// =============================================================================

const monthKey = (iso: string) => iso.slice(0, 7);
const round = (n: number) => +n.toFixed(2);

export function buildLedger(inputs: LedgerInputs, now: number = Date.now()): Ledger {
  const overrideById = new Map<string, TxnOverride>(inputs.overrides.map((o) => [o.transactionId, o]));
  const live = inputs.txns.filter((t) => !t.removed);

  // ── Transfers (detected) merged with user overrides (sticky, win) ──
  const detected = detectTransfers(live);
  const isTransfer = (t: LedgerTxn): boolean => {
    const o = overrideById.get(t.transactionId);
    if (o?.isTransfer) return true;
    if (o && o.isTransfer === false && o.category) return false; // explicit user un-mark
    return detected.transferIds.has(t.transactionId);
  };
  const isExcluded = (t: LedgerTxn): boolean => overrideById.get(t.transactionId)?.excluded ?? false;

  const nonTransfer = live.filter((t) => !isTransfer(t) && !isExcluded(t));
  const deposits = nonTransfer.filter((t) => t.amount < 0);
  const expenses = nonTransfer.filter((t) => t.amount > 0);

  // ── Income + obligations over the non-transfer set ──
  const income = detectIncome(deposits);
  const obligations = classifyObligations(expenses);

  // ── Per-transaction flags (ledger_txn_flags) ──
  const flags: TxnFlag[] = live.map((t) => ({
    transactionId: t.transactionId,
    isTransfer: isTransfer(t),
    transferPairId: detected.transferIds.get(t.transactionId) ?? null,
    isIncome: income.incomeTxnIds.has(t.transactionId),
    obligationKind: obligations.kinds.get(t.transactionId) ?? null,
  }));

  // ── Monthly rollups ──
  const monthMap = new Map<string, LedgerMonth>();
  const ensure = (mk: string): LedgerMonth => {
    let m = monthMap.get(mk);
    if (!m) { m = { month: mk, income: 0, fixed: 0, discretionary: 0, savingsFlow: 0, byCategory: {} }; monthMap.set(mk, m); }
    return m;
  };

  for (const t of deposits) {
    // All non-transfer deposits count as income for the flow math (irregular
    // deposits are still money in); income STREAMS are the recurring subset.
    ensure(monthKey(t.date)).income += Math.abs(t.amount);
  }
  for (const t of expenses) {
    const m = ensure(monthKey(t.date));
    const kind = obligations.kinds.get(t.transactionId);
    if (kind === "fixed") m.fixed += t.amount;
    else m.discretionary += t.amount;
    const cat = overrideById.get(t.transactionId)?.category
      ?? categorize({ merchant: t.merchant, name: t.name, plaidDetailed: t.plaidDetailed, plaidPrimary: t.plaidCategory });
    m.byCategory[cat] = (m.byCategory[cat] ?? 0) + t.amount;
  }

  const months = [...monthMap.values()]
    .map((m) => ({
      ...m,
      income: round(m.income), fixed: round(m.fixed), discretionary: round(m.discretionary),
      savingsFlow: round(m.income - m.fixed - m.discretionary),
      byCategory: Object.fromEntries(Object.entries(m.byCategory).map(([k, v]) => [k, round(v)])),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    months,
    flags,
    incomeStreams: income.streams,
    cards: inputs.cards,
    balances: inputs.balances,
    netWorthHistory: inputs.netWorthHistory.slice().sort((a, b) => a.date.localeCompare(b.date)),
    asOf: new Date(now).toISOString(),
    monthsOfData: months.length,
  };
}
