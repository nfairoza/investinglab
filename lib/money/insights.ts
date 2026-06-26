import type { SupabaseClient } from "@supabase/supabase-js";
import { categorize } from "@/lib/money/categorize";

// =============================================================================
// Money insights — DETERMINISTIC detection of personal spending patterns from
// the user's own transaction history. No AI here; the math is exact. The AI
// layer (Accounts Doctor / Money analysis) only narrates these computed facts.
//
// Three kinds of insight:
//   1. categoryAnomalies — a category you spent NON-TRIVIALLY more (or less) on
//      this month vs your own trailing average. "You spent a lot on X this
//      month — usually you spend less."
//   2. billChanges — a recurring merchant whose charge was STABLE for a while
//      then stepped up/down (a price hike or drop). "Netflix went from $15.49
//      to $17.99 — first increase in 8 months."
//   3. billTrends — a recurring/variable bill's month-by-month series (utilities
//      like water/electric) so the UI can plot it.
// =============================================================================

interface TxnRow { amount: number; plaid_category: string | null; merchant: string | null; name: string; date: string; removed: boolean }

export interface CategoryAnomaly {
  category: string;
  thisMonth: number;
  typicalMonth: number;   // trailing average of prior complete months
  deltaPct: number;       // signed % vs typical
  deltaAmount: number;    // signed $ vs typical
  isNew: boolean;         // no spend in this category in prior months
  direction: "up" | "down";
}

export interface BillChange {
  merchant: string;
  previousAmount: number; // the stable charge before the change
  newAmount: number;      // the latest charge
  deltaPct: number;
  deltaAmount: number;
  stableMonths: number;   // how many months it was steady before the change
  changedOn: string;      // YYYY-MM-DD of the new charge
  direction: "up" | "down";
}

export interface BillTrendPoint { month: string; amount: number }
export interface BillTrend {
  merchant: string;
  points: BillTrendPoint[]; // chronological, last ~12 months
  latest: number;
  min: number;
  max: number;
  avg: number;
}

// A recurring income source (paycheck / regular deposit) that changed amount or
// appears to have stopped.
export interface IncomeChange {
  source: string;                 // payer/merchant name
  kind: "raised" | "lowered" | "stopped";
  previousAmount: number;         // the steady deposit before the change
  newAmount: number;              // latest deposit (0 if stopped)
  deltaPct: number;
  deltaAmount: number;
  stableMonths: number;           // how many months it was steady before
  lastSeen: string;               // YYYY-MM of the last deposit
}

export interface MoneyInsights {
  available: boolean;
  monthsOfData: number;
  categoryAnomalies: CategoryAnomaly[];
  billChanges: BillChange[];
  billTrends: BillTrend[];
  incomeChanges: IncomeChange[];
}

const monthKey = (iso: string) => iso.slice(0, 7);
const round = (n: number) => +n.toFixed(2);

function prevMonthKeys(count: number): string[] {
  // Build the last `count` month keys ending with the current month (UTC-safe
  // enough for grouping; we never compute "now" inside React render here).
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function computeMoneyInsights(ctx: { supabase: SupabaseClient }): Promise<MoneyInsights> {
  // ~13 months of history so we have a full trailing year + the current month.
  const since = new Date();
  since.setMonth(since.getMonth() - 13);
  const { data } = await ctx.supabase
    .from("plaid_transactions")
    .select("amount, plaid_category, plaid_detailed, merchant, name, date, removed")
    .gte("date", since.toISOString().slice(0, 10));

  const live = ((data ?? []) as TxnRow[]).filter((t) => !t.removed);
  const txns = live.filter((t) => Number(t.amount) > 0);  // expenses
  const income = live.filter((t) => Number(t.amount) < 0); // deposits (Plaid: negative = money in)
  if (txns.length === 0 && income.length === 0) {
    return { available: false, monthsOfData: 0, categoryAnomalies: [], billChanges: [], billTrends: [], incomeChanges: [] };
  }

  const months = prevMonthKeys(13);
  const thisMonth = months[months.length - 1];
  const priorMonths = months.slice(0, -1);
  const observedMonths = new Set(live.map((t) => monthKey(t.date)));
  const monthsOfData = [...observedMonths].length;

  // ── 1. Category anomalies: this month vs trailing average of prior months ──
  const catByMonth = new Map<string, Map<string, number>>(); // category → month → $
  for (const t of txns) {
    const cat = categorize({ merchant: t.merchant, name: t.name, plaidDetailed: (t as any).plaid_detailed, plaidPrimary: t.plaid_category });
    const mk = monthKey(t.date);
    const m = catByMonth.get(cat) ?? new Map<string, number>();
    m.set(mk, (m.get(mk) ?? 0) + Number(t.amount));
    catByMonth.set(cat, m);
  }

  const categoryAnomalies: CategoryAnomaly[] = [];
  for (const [cat, byMonth] of catByMonth) {
    const thisAmt = byMonth.get(thisMonth) ?? 0;
    const priorVals = priorMonths.map((mk) => byMonth.get(mk) ?? 0).filter((_, i) => observedMonths.has(priorMonths[i]));
    const priorWithSpend = priorVals.filter((v) => v > 0);
    const typical = priorVals.length ? priorVals.reduce((s, v) => s + v, 0) / priorVals.length : 0;
    const isNew = priorWithSpend.length === 0 && thisAmt > 0;
    const deltaAmount = thisAmt - typical;

    // Non-trivial gate: at least $40 swing AND >=35% vs typical (or brand-new
    // category with >=$40 spent). Avoids noise on tiny categories.
    if (isNew && thisAmt >= 40) {
      categoryAnomalies.push({ category: cat, thisMonth: round(thisAmt), typicalMonth: 0, deltaPct: 100, deltaAmount: round(thisAmt), isNew: true, direction: "up" });
      continue;
    }
    if (typical <= 0 || thisAmt <= 0) continue;
    const deltaPct = (deltaAmount / typical) * 100;
    if (Math.abs(deltaAmount) >= 40 && Math.abs(deltaPct) >= 35) {
      categoryAnomalies.push({
        category: cat, thisMonth: round(thisAmt), typicalMonth: round(typical),
        deltaPct: +deltaPct.toFixed(0), deltaAmount: round(deltaAmount), isNew: false,
        direction: deltaAmount >= 0 ? "up" : "down",
      });
    }
  }
  categoryAnomalies.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));

  // ── Per-merchant monthly charge series (for bill changes + trends) ──
  // Group by merchant → month → { total, count } so we can use the per-charge
  // amount (total/count) to detect a price step even with one charge per month.
  const merchByMonth = new Map<string, Map<string, { total: number; count: number }>>();
  for (const t of txns) {
    const m = (t.merchant ?? t.name ?? "Unknown").trim();
    if (!m || m === "Unknown") continue;
    const mk = monthKey(t.date);
    const byM = merchByMonth.get(m) ?? new Map();
    const cell = byM.get(mk) ?? { total: 0, count: 0 };
    cell.total += Number(t.amount); cell.count += 1;
    byM.set(mk, cell); merchByMonth.set(m, byM);
  }

  const billChanges: BillChange[] = [];
  const billTrends: BillTrend[] = [];

  for (const [merchant, byMonth] of merchByMonth) {
    // Recurring = charged in >= 3 distinct months.
    const monthsHit = [...byMonth.keys()].sort();
    if (monthsHit.length < 3) continue;

    // Per-charge amount each month (handles both fixed subs and variable bills).
    const series: BillTrendPoint[] = monthsHit.map((mk) => {
      const c = byMonth.get(mk)!;
      return { month: mk, amount: round(c.total / Math.max(1, c.count)) };
    });
    const amounts = series.map((p) => p.amount);
    const min = Math.min(...amounts), max = Math.max(...amounts);
    const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;

    // Variable bill (utility-like): meaningful month-to-month variation → expose
    // a trend to plot. Coefficient of variation > 12% and >= 4 months.
    const variation = avg > 0 ? (max - min) / avg : 0;
    if (series.length >= 4 && variation > 0.12) {
      billTrends.push({ merchant, points: series.slice(-12), latest: amounts[amounts.length - 1], min: round(min), max: round(max), avg: round(avg) });
    }

    // Bill change (price hike/drop): a run of near-constant charges, then a step.
    // Compare the latest charge to the modal/most-recent-stable prior charge.
    const latest = series[series.length - 1];
    const prior = series.slice(0, -1);
    if (prior.length >= 2) {
      // "Stable prior" = the most recent prior amount, and count how many
      // consecutive months before the change were within 1% of it.
      const priorAmt = prior[prior.length - 1].amount;
      let stable = 0;
      for (let i = prior.length - 1; i >= 0; i--) {
        if (Math.abs(prior[i].amount - priorAmt) <= Math.max(0.5, priorAmt * 0.01)) stable++;
        else break;
      }
      const deltaAmount = latest.amount - priorAmt;
      const deltaPct = priorAmt > 0 ? (deltaAmount / priorAmt) * 100 : 0;
      // Step is real if it was stable >= 2 months, the change is >= 5% AND >= $2,
      // and it isn't just normal variable-bill noise (skip ones already flagged
      // as variable trends — those are expected to move).
      const isVariable = billTrends.some((b) => b.merchant === merchant);
      if (!isVariable && stable >= 2 && Math.abs(deltaPct) >= 5 && Math.abs(deltaAmount) >= 2) {
        billChanges.push({
          merchant, previousAmount: round(priorAmt), newAmount: round(latest.amount),
          deltaPct: +deltaPct.toFixed(0), deltaAmount: round(deltaAmount), stableMonths: stable,
          changedOn: monthsHit[monthsHit.length - 1], direction: deltaAmount >= 0 ? "up" : "down",
        });
      }
    }
  }
  billChanges.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));
  billTrends.sort((a, b) => (b.max - b.min) - (a.max - a.min));

  // ── Income changes: recurring deposits that changed amount or stopped ──
  // Group deposits by source (merchant/name), per month using the largest single
  // deposit that month (a paycheck), so two paychecks don't look like a raise.
  const incomeBySource = new Map<string, Map<string, number>>();
  for (const t of income) {
    const src = (t.merchant ?? t.name ?? "").trim();
    if (!src) continue;
    const mk = monthKey(t.date);
    const amt = Math.abs(Number(t.amount));
    const byM = incomeBySource.get(src) ?? new Map<string, number>();
    byM.set(mk, Math.max(byM.get(mk) ?? 0, amt)); // largest deposit that month
    incomeBySource.set(src, byM);
  }

  const incomeChanges: IncomeChange[] = [];
  for (const [source, byMonth] of incomeBySource) {
    const monthsHit = [...byMonth.keys()].sort();
    // Recurring income = present in >= 3 distinct months and a meaningful sum
    // (avoid flagging tiny one-off refunds).
    if (monthsHit.length < 3) continue;
    const seriesAmts = monthsHit.map((mk) => byMonth.get(mk)!);
    const typical = seriesAmts.reduce((s, v) => s + v, 0) / seriesAmts.length;
    if (typical < 200) continue; // ignore small incidental deposits

    const lastSeen = monthsHit[monthsHit.length - 1];
    const lastIdx = months.indexOf(lastSeen);
    const thisIdx = months.length - 1;

    // STOPPED: a steady source that hasn't deposited for the last 1-2 months.
    if (lastIdx >= 0 && thisIdx - lastIdx >= 1) {
      const priorAmt = byMonth.get(monthsHit[monthsHit.length - 1])!;
      incomeChanges.push({
        source, kind: "stopped", previousAmount: round(priorAmt), newAmount: 0,
        deltaPct: -100, deltaAmount: round(-priorAmt), stableMonths: monthsHit.length, lastSeen,
      });
      continue;
    }

    // RAISED / LOWERED: steady for >= 2 months then a step in the latest deposit.
    const prior = seriesAmts.slice(0, -1);
    const latestAmt = seriesAmts[seriesAmts.length - 1];
    if (prior.length >= 2) {
      const priorAmt = prior[prior.length - 1];
      let stable = 0;
      for (let i = prior.length - 1; i >= 0; i--) {
        if (Math.abs(prior[i] - priorAmt) <= Math.max(1, priorAmt * 0.02)) stable++;
        else break;
      }
      const deltaAmount = latestAmt - priorAmt;
      const deltaPct = priorAmt > 0 ? (deltaAmount / priorAmt) * 100 : 0;
      // Real step: stable >= 2 months, change >= 3% AND >= $50.
      if (stable >= 2 && Math.abs(deltaPct) >= 3 && Math.abs(deltaAmount) >= 50) {
        incomeChanges.push({
          source, kind: deltaAmount >= 0 ? "raised" : "lowered",
          previousAmount: round(priorAmt), newAmount: round(latestAmt),
          deltaPct: +deltaPct.toFixed(0), deltaAmount: round(deltaAmount), stableMonths: stable, lastSeen,
        });
      }
    }
  }
  // Stopped income first (most actionable), then biggest swings.
  incomeChanges.sort((a, b) => (a.kind === "stopped" ? -1 : 0) - (b.kind === "stopped" ? -1 : 0) || Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));

  return {
    available: true,
    monthsOfData,
    categoryAnomalies: categoryAnomalies.slice(0, 6),
    billChanges: billChanges.slice(0, 6),
    billTrends: billTrends.slice(0, 4),
    incomeChanges: incomeChanges.slice(0, 4),
  };
}
