import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ledger } from "@/lib/insights/types";
import { recordDelivery } from "@/lib/alerts/delivery";

// =============================================================================
// H1 — Budget threshold alerts. When month-to-date spending in a budgeted
// category crosses 80% or 100% of its monthly budget, deliver ONE notification
// per threshold per month per budget (deduped). Deterministic; the numbers come
// from the ledger. Delivered through the standard pipeline (in-app always, push
// on severity 1). Never red-alarm shame — the copy is gentle, per house rules.
// =============================================================================

export interface BudgetRow { id: string; category: string; monthlyAmount: number }

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// Pure: which thresholds a budget has crossed given its MTD spend. Returns the
// crossed thresholds (80 before 100) so each fires its own once-per-month alert.
export function crossedThresholds(spentMtd: number, budget: number): number[] {
  if (budget <= 0) return [];
  const pct = (spentMtd / budget) * 100;
  const out: number[] = [];
  if (pct >= 80) out.push(80);
  if (pct >= 100) out.push(100);
  return out;
}

// Evaluate all active personal budgets for one user against the current month's
// MTD spend from the ledger, delivering threshold alerts. `db` is service-role
// (cron) or user-scoped. Idempotent within a month via the dedupeKey.
export async function evaluateBudgetThresholds(
  db: SupabaseClient,
  userId: string,
  ledger: Ledger,
  nowMs = Date.now(),
): Promise<{ delivered: number }> {
  const now = new Date(nowMs);
  const curMonth = now.toISOString().slice(0, 7); // YYYY-MM
  const cur = ledger.months.find((m) => m.month === curMonth);
  if (!cur) return { delivered: 0 };

  const { data: rows } = await db.from("budgets")
    .select("id, category, monthly_amount")
    .eq("owner_id", userId).eq("scope", "personal").eq("status", "active");
  const budgets: BudgetRow[] = (rows ?? []).map((r: any) => ({
    id: String(r.id), category: String(r.category), monthlyAmount: Number(r.monthly_amount),
  }));
  if (!budgets.length) return { delivered: 0 };

  let delivered = 0;
  for (const b of budgets) {
    const spent = cur.byCategory[b.category] ?? 0;
    for (const threshold of crossedThresholds(spent, b.monthlyAmount)) {
      const over = spent - b.monthlyAmount;
      const daysLeft = daysLeftInMonth(now);
      const title = threshold >= 100
        ? `${b.category} budget reached`
        : `${b.category} budget at ${Math.round((spent / b.monthlyAmount) * 100)}%`;
      const body = threshold >= 100
        ? `You've spent ${money(spent)} of your ${money(b.monthlyAmount)} ${b.category} budget${over > 0 ? ` — ${money(over)} over` : ""}, ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Worth a look.`
        : `You're at ${money(spent)} of ${money(b.monthlyAmount)} for ${b.category} with ${daysLeft} day${daysLeft === 1 ? "" : "s"} left this month.`;
      const r = await recordDelivery(db, {
        alertId: null,
        userId,
        severity: 1,
        kind: "budget",
        title,
        body,
        url: "/money/budgets",
        // Once per threshold per month per budget.
        dedupeKey: `budget:${b.id}:${threshold}:${curMonth}`,
      }).catch(() => null);
      if (r) delivered++;
    }
  }
  return { delivered };
}

function daysLeftInMonth(now: Date): number {
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
  return Math.max(0, daysInMonth - now.getUTCDate());
}
