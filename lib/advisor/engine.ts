import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { categorize } from "@/lib/money/categorize";
import { plaidInvestmentCash } from "@/lib/holdings-server";
import { computeNetWorth, type NetWorthResult } from "@/lib/networth";

// =============================================================================
// Advisor compute engine — SERVER-SIDE ONLY.
//
// Reads the current user's real financial data and produces a deterministic,
// ranked "financial order of operations" result. ALL dollar amounts, APRs,
// percentages, months-of-runway, and rankings are computed HERE in code.
// The AI layer only narrates these computed facts — it never invents numbers.
//
// Order of operations evaluated:
//   1. Emergency fund (3–6 months of expenses)
//   2. Employer match (capture full match if data exists)
//   3. High-interest debt (APR ≳ 7–8%)
//   4. Tax-advantaged contributions (only if user-provided)
//   5. Taxable investing
//   6. Other goals
// =============================================================================

export type StepStatus = "done" | "in_progress" | "attention" | "missing_data";
export type Priority = "high" | "medium" | "low";

export interface ComputedFact { label: string; value: string }

export interface AdvisorStep {
  id: string;
  rank: number;
  title: string;
  status: StepStatus;
  priority: Priority;
  computedFacts: ComputedFact[];
  explanationInput: string; // plain, factual seed handed to the AI for narration
  mathSummary: string;      // the arithmetic, human-readable
  missingData?: string[];
  cta?: { label: string; href: string };
}

export interface SurplusRouting {
  available: boolean;
  income: number;
  expenses: number;
  surplus: number;
  destination: string;      // where the surplus should go first (computed)
  rationale: string;        // factual rationale (no AI)
  missing?: string;
}

export interface SpendingInsights {
  available: boolean;
  monthIncome: number;
  monthExpenses: number;
  net: number;
  topCategories: { category: string; amount: number }[];
  topMerchants: { merchant: string; amount: number }[];
  recurring: { merchant: string; amount: number; months: number }[];
  movers: { category: string; thisMonth: number; lastMonth: number; deltaPct: number }[];
}

export interface AdvisorResult {
  generatedAt: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  liquidCash: number;
  avgMonthlyExpenses: number | null;
  steps: AdvisorStep[];
  surplus: SurplusRouting;
  spending: SpendingInsights;
  hasAnyData: boolean;
  dataSources: string[];     // which inputs were available
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

// ── Transaction-derived spending (income/expenses/categories/recurring) ──────
interface TxnRow { amount: number; plaid_category: string | null; plaid_detailed?: string | null; merchant: string | null; name: string; date: string; removed: boolean }

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // YYYY-MM
}

function computeSpending(txns: TxnRow[]): { spending: SpendingInsights; avgMonthlyExpenses: number | null } {
  const live = txns.filter((t) => !t.removed);
  if (live.length === 0) {
    return {
      avgMonthlyExpenses: null,
      spending: { available: false, monthIncome: 0, monthExpenses: 0, net: 0, topCategories: [], topMerchants: [], recurring: [], movers: [] },
    };
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastM.getFullYear()}-${String(lastM.getMonth() + 1).padStart(2, "0")}`;

  // Plaid sign convention: amount > 0 = money OUT (expense); amount < 0 = money IN (income).
  let monthIncome = 0, monthExpenses = 0;
  const catThis = new Map<string, number>();
  const catLast = new Map<string, number>();
  const merchants = new Map<string, number>();
  // expenses grouped by month → average monthly expenses (for emergency fund).
  const expensesByMonth = new Map<string, number>();
  // merchant → set of months seen + amounts (for recurring detection).
  const merchMonths = new Map<string, { months: Set<string>; amounts: number[] }>();

  for (const t of live) {
    const amt = Number(t.amount);
    const mk = monthKey(t.date);
    const cat = categorize({ merchant: t.merchant, name: t.name, plaidDetailed: t.plaid_detailed, plaidPrimary: t.plaid_category });
    if (amt > 0) {
      expensesByMonth.set(mk, (expensesByMonth.get(mk) ?? 0) + amt);
      const m = (t.merchant ?? t.name ?? "Unknown").trim();
      merchants.set(m, (merchants.get(m) ?? 0) + amt);
      if (mk === thisMonth) { monthExpenses += amt; catThis.set(cat, (catThis.get(cat) ?? 0) + amt); }
      if (mk === lastMonth) catLast.set(cat, (catLast.get(cat) ?? 0) + amt);
      const rec = merchMonths.get(m) ?? { months: new Set<string>(), amounts: [] };
      rec.months.add(mk); rec.amounts.push(amt); merchMonths.set(m, rec);
    } else if (amt < 0 && mk === thisMonth) {
      monthIncome += -amt;
    }
  }

  // Average monthly expenses across observed months (ignore an in-progress current
  // month if we have at least one complete prior month, so the average isn't skewed low).
  const monthsWithExp = [...expensesByMonth.keys()].sort();
  let avgMonthlyExpenses: number | null = null;
  if (monthsWithExp.length > 0) {
    const complete = monthsWithExp.filter((m) => m !== thisMonth);
    const basis = complete.length > 0 ? complete : monthsWithExp;
    const total = basis.reduce((s, m) => s + (expensesByMonth.get(m) ?? 0), 0);
    avgMonthlyExpenses = total / basis.length;
  }

  const topCategories = [...catThis.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount: +amount.toFixed(0) }));
  const topMerchants = [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([merchant, amount]) => ({ merchant, amount: +amount.toFixed(0) }));

  // Recurring: same merchant in ≥2 distinct months with a stable-ish amount.
  const recurring = [...merchMonths.entries()]
    .filter(([, v]) => v.months.size >= 2)
    .map(([merchant, v]) => {
      const avg = v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length;
      return { merchant, amount: +avg.toFixed(0), months: v.months.size };
    })
    .filter((r) => r.amount >= 5)
    .sort((a, b) => b.months - a.months || b.amount - a.amount)
    .slice(0, 8);

  // Category movers: this month vs last month.
  const movers = [...catThis.entries()].map(([category, thisAmt]) => {
    const last = catLast.get(category) ?? 0;
    const deltaPct = last > 0 ? ((thisAmt - last) / last) * 100 : (thisAmt > 0 ? 100 : 0);
    return { category, thisMonth: +thisAmt.toFixed(0), lastMonth: +last.toFixed(0), deltaPct: +deltaPct.toFixed(0) };
  }).filter((m) => Math.abs(m.deltaPct) >= 25 && m.thisMonth >= 50).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct)).slice(0, 4);

  return {
    avgMonthlyExpenses: avgMonthlyExpenses != null ? +avgMonthlyExpenses.toFixed(0) : null,
    spending: {
      available: true,
      monthIncome: +monthIncome.toFixed(0),
      monthExpenses: +monthExpenses.toFixed(0),
      net: +(monthIncome - monthExpenses).toFixed(0),
      topCategories, topMerchants, recurring, movers,
    },
  };
}

// ── Debt detail with APR (Plaid Liabilities) ─────────────────────────────────
interface DebtLine { name: string; balance: number; apr: number | null; minPayment: number | null; kind: string }

async function gatherDebts(ctx: { supabase: SupabaseClient }): Promise<DebtLine[]> {
  if (!plaidConfigured()) return [];
  const { data: items } = await ctx.supabase.from("plaid_items").select("institution_name, access_token");
  const plaid = getPlaid();
  const debts: DebtLine[] = [];
  for (const it of items ?? []) {
    try {
      const resp = await plaid.liabilitiesGet({ access_token: it.access_token });
      const accts = new Map((resp.data.accounts ?? []).map((a: any) => [a.account_id, a]));
      const L: any = resp.data.liabilities ?? {};
      for (const c of L.credit ?? []) {
        const a: any = accts.get(c.account_id);
        const bal = a?.balances?.current;
        if (bal == null) continue;
        // Plaid credit APRs is an array; use the purchase/balance-transfer APR if present, else the max.
        const aprs: number[] = (c.aprs ?? []).map((x: any) => Number(x.apr_percentage)).filter((n: number) => Number.isFinite(n));
        const apr = aprs.length ? Math.max(...aprs) : null;
        debts.push({ name: `${it.institution_name ?? "Card"} · ${a?.name ?? "Credit card"}`, balance: Math.abs(Number(bal)), apr, minPayment: c.minimum_payment_amount ?? null, kind: "credit_card" });
      }
      for (const s of L.student ?? []) {
        const a: any = accts.get(s.account_id);
        const bal = a?.balances?.current;
        if (bal == null) continue;
        debts.push({ name: `${it.institution_name ?? "Loan"} · ${a?.name ?? "Student loan"}`, balance: Math.abs(Number(bal)), apr: s.interest_rate_percentage != null ? Number(s.interest_rate_percentage) : null, minPayment: s.minimum_payment_amount ?? null, kind: "student" });
      }
      for (const m of L.mortgage ?? []) {
        const a: any = accts.get(m.account_id);
        const bal = a?.balances?.current;
        if (bal == null) continue;
        const apr = m.interest_rate?.percentage != null ? Number(m.interest_rate.percentage) : null;
        debts.push({ name: `${it.institution_name ?? "Mortgage"} · ${a?.name ?? "Mortgage"}`, balance: Math.abs(Number(bal)), apr, minPayment: m.next_monthly_payment ?? null, kind: "mortgage" });
      }
    } catch { /* item may not support liabilities */ }
  }
  return debts;
}

const HIGH_APR = 7; // APR at or above this is "high-interest" priority debt.

export async function computeAdvisor(ctx: { supabase: SupabaseClient; userId: string }): Promise<AdvisorResult> {
  const generatedAt = new Date().toISOString();
  const dataSources: string[] = [];

  // Net worth (assets, liabilities, liquid, cash) — reuse the audited engine.
  let nw: NetWorthResult;
  try { nw = await computeNetWorth(ctx); } catch {
    nw = { totalAssets: 0, totalLiabilities: 0, netWorth: 0, liquid: 0, illiquid: 0, byType: {}, items: [], excluded: [], sourceHash: "" };
  }
  // Cash on hand = bank/depository cash PLUS uninvested cash sitting in
  // brokerage accounts (e.g. proceeds from selling E*TRADE shares). The net-worth
  // engine only tags depository accounts as "cash", so we add the brokerage cash
  // sweep separately — otherwise a user who sold shares sees $0 cash here.
  const bankCash = nw.items.filter((i) => i.kind === "asset" && i.type === "cash").reduce((s, i) => s + i.amount, 0);
  const investmentCash = await plaidInvestmentCash(ctx.supabase).catch(() => 0);
  const liquidCash = bankCash + investmentCash;
  if (nw.items.length) dataSources.push("net worth");

  // Spending from cached transactions (last ~120 days).
  const since = new Date(); since.setDate(since.getDate() - 120);
  const { data: txns } = await ctx.supabase
    .from("plaid_transactions")
    .select("amount, plaid_category, plaid_detailed, merchant, name, date, removed")
    .gte("date", since.toISOString().slice(0, 10));
  const { spending, avgMonthlyExpenses } = computeSpending((txns ?? []) as TxnRow[]);
  if (spending.available) dataSources.push("transactions");

  // Debts with APR.
  const debts = await gatherDebts(ctx);
  if (debts.length) dataSources.push("liabilities");
  const highApr = debts.filter((d) => d.apr != null && d.apr >= HIGH_APR).sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0));
  const aprUnknown = debts.filter((d) => d.apr == null && d.kind !== "mortgage");
  const totalHighInterest = highApr.reduce((s, d) => s + d.balance, 0);

  const steps: AdvisorStep[] = [];

  // ── Step 1: Emergency fund ──────────────────────────────────────────────────
  {
    let status: StepStatus = "missing_data";
    const facts: ComputedFact[] = [];
    const missing: string[] = [];
    let mathSummary = "", explanation = "";
    if (avgMonthlyExpenses == null) missing.push("monthly expenses (link a checking account so we can see spending)");
    if (liquidCash <= 0 && avgMonthlyExpenses == null) missing.push("cash balance (link a bank account)");

    if (avgMonthlyExpenses != null && avgMonthlyExpenses > 0) {
      const months = liquidCash / avgMonthlyExpenses;
      facts.push({ label: "Cash on hand", value: money(liquidCash) });
      facts.push({ label: "Avg monthly expenses", value: money(avgMonthlyExpenses) });
      facts.push({ label: "Runway", value: `${months.toFixed(1)} months` });
      mathSummary = `${money(liquidCash)} cash ÷ ${money(avgMonthlyExpenses)}/mo = ${months.toFixed(1)} months of runway.`;
      const targetLow = avgMonthlyExpenses * 3, targetHigh = avgMonthlyExpenses * 6;
      if (months >= 6) { status = "done"; explanation = `The user has ${months.toFixed(1)} months of expenses in liquid cash — a fully funded emergency fund (target is 3–6 months, i.e. ${money(targetLow)}–${money(targetHigh)}).`; }
      else if (months >= 3) { status = "in_progress"; explanation = `The user has ${months.toFixed(1)} months of runway, inside the 3–6 month target range (${money(targetLow)}–${money(targetHigh)}). Topping up toward 6 months adds resilience.`; }
      else { status = "attention"; const gap = targetLow - liquidCash; explanation = `The user has only ${months.toFixed(1)} months of runway — below the 3-month minimum. They are about ${money(Math.max(0, gap))} short of a 3-month fund (${money(targetLow)}).`; }
    } else {
      explanation = "Emergency-fund runway can't be computed until monthly expenses are known.";
    }
    steps.push({
      id: "emergency_fund", rank: 1, title: "Emergency fund",
      status, priority: status === "attention" ? "high" : status === "in_progress" ? "medium" : "low",
      computedFacts: facts, explanationInput: explanation, mathSummary,
      missingData: missing.length ? missing : undefined,
      cta: { label: "View accounts & spending", href: "/spending" },
    });
  }

  // ── Step 2: Employer match (we have no retirement data source) ───────────────
  steps.push({
    id: "employer_match", rank: 2, title: "Employer 401(k) match",
    status: "missing_data", priority: "medium", computedFacts: [],
    explanationInput: "We don't have the user's employer-match details, so we can't tell whether they're leaving free matching money unclaimed. This is education only — capturing a full employer match is typically the highest-return step after a starter emergency fund.",
    mathSummary: "",
    missingData: ["employer match formula, contribution rate, and plan type (not yet tracked in rukMoney)"],
  });

  // ── Step 3: High-interest debt ──────────────────────────────────────────────
  {
    const facts: ComputedFact[] = [];
    let status: StepStatus, priority: Priority = "low", explanation = "", mathSummary = "";
    const missing: string[] = [];
    if (debts.length === 0) {
      status = "missing_data";
      explanation = "No debt accounts are linked, so we can't assess high-interest debt. If the user has credit cards or loans elsewhere, linking them gives a complete picture.";
      missing.push("debt accounts (link credit cards / loans)");
    } else {
      if (highApr.length > 0) {
        const worst = highApr[0];
        status = "attention"; priority = "high";
        facts.push({ label: "High-interest balance", value: money(totalHighInterest) });
        facts.push({ label: "Highest APR", value: worst.apr != null ? pct(worst.apr) : "unknown" });
        facts.push({ label: "On", value: worst.name });
        const yearlyInterest = totalHighInterest * ((worst.apr ?? 0) / 100);
        mathSummary = `${money(totalHighInterest)} at ~${pct(worst.apr ?? 0)} costs roughly ${money(yearlyInterest)}/yr in interest if carried.`;
        explanation = `The user carries ${money(totalHighInterest)} of debt at or above ${HIGH_APR}% APR (highest: ${worst.apr != null ? pct(worst.apr) : "unknown"} on ${worst.name}). High-APR debt usually beats investing returns, so paying it down is a priority. Explain avalanche (highest APR first, least total interest) vs snowball (smallest balance first, motivational) as education — do not recommend a specific lender or refinance product.`;
      } else {
        status = "done";
        const total = debts.reduce((s, d) => s + d.balance, 0);
        facts.push({ label: "Total debt", value: money(total) });
        facts.push({ label: "High-interest (≥7%)", value: money(0) });
        explanation = `The user has ${money(total)} of linked debt but none at or above ${HIGH_APR}% APR, so there's no urgent high-interest debt to attack. Lower-rate debt can be paid on schedule while investing.`;
      }
      if (aprUnknown.length > 0) missing.push(`APR is unknown on ${aprUnknown.length} debt${aprUnknown.length > 1 ? "s" : ""} — can't classify ${aprUnknown.map((d) => d.name).join(", ")}`);
    }
    steps.push({
      id: "high_interest_debt", rank: 3, title: "High-interest debt",
      status, priority, computedFacts: facts, explanationInput: explanation, mathSummary,
      missingData: missing.length ? missing : undefined,
      cta: { label: "View liabilities", href: "/accounts" },
    });
  }

  // ── Step 4: Tax-advantaged investing (no plan data) ──────────────────────────
  steps.push({
    id: "tax_advantaged", rank: 4, title: "Tax-advantaged investing",
    status: "missing_data", priority: "low", computedFacts: [],
    explanationInput: "We don't have the user's IRA / HSA / 401(k) contribution data or eligibility, so we can't compute remaining contribution room. Education only: after an emergency fund and high-interest debt, tax-advantaged accounts are usually the next priority. Do not assume filing status, income eligibility, or contribution limits.",
    mathSummary: "",
    missingData: ["retirement / HSA contributions and eligibility (not yet tracked)"],
  });

  // ── Step 5: Taxable investing ───────────────────────────────────────────────
  {
    const invested = nw.items.filter((i) => i.kind === "asset" && i.type === "investment").reduce((s, i) => s + i.amount, 0);
    const facts: ComputedFact[] = [{ label: "Taxable investments", value: money(invested) }];
    const efDone = steps[0].status === "done" || steps[0].status === "in_progress";
    const noHighDebt = highApr.length === 0;
    let status: StepStatus = invested > 0 ? "in_progress" : "attention";
    let explanation = "";
    if (invested > 0) {
      explanation = `The user has ${money(invested)} in taxable investments. ${efDone && noHighDebt ? "With an emergency fund underway and no urgent high-APR debt, continuing to invest surplus is reasonable." : "Earlier priorities (emergency fund / high-interest debt) generally come before adding more here."} Education only — no specific securities are recommended.`;
    } else {
      status = "attention";
      explanation = "The user has no taxable investments tracked yet. Once earlier priorities are covered, a low-cost diversified approach is the usual education-level next step — no specific securities recommended.";
    }
    steps.push({
      id: "taxable_investing", rank: 5, title: "Taxable investing",
      status, priority: "low", computedFacts: facts, explanationInput: explanation, mathSummary: "",
      cta: { label: "Open Invest", href: "/dashboard" },
    });
  }

  // ── Surplus routing ─────────────────────────────────────────────────────────
  let surplus: SurplusRouting;
  if (!spending.available || spending.monthIncome <= 0) {
    surplus = { available: false, income: spending.monthIncome, expenses: spending.monthExpenses, surplus: 0, destination: "", rationale: "", missing: "We can't see reliable monthly income yet — link a checking account that receives your paycheck so surplus can be computed." };
  } else {
    const s = spending.monthIncome - spending.monthExpenses;
    let destination: string, rationale: string;
    const efMonths = avgMonthlyExpenses ? liquidCash / avgMonthlyExpenses : null;
    if (s <= 0) {
      destination = "Reduce spending";
      rationale = `This month expenses (${money(spending.monthExpenses)}) meet or exceed income (${money(spending.monthIncome)}), so there is no surplus to route. The first lever is trimming spending or raising income.`;
    } else if (efMonths != null && efMonths < 3) {
      destination = "Emergency fund";
      rationale = `Surplus of ${money(s)} should go first to the emergency fund — runway is ${efMonths.toFixed(1)} months, below the 3-month minimum.`;
    } else if (highApr.length > 0) {
      destination = "High-interest debt";
      rationale = `Emergency fund is at least 3 months, so surplus of ${money(s)} is best aimed at the ${money(totalHighInterest)} of debt above ${HIGH_APR}% APR.`;
    } else if (efMonths != null && efMonths < 6) {
      destination = "Top up emergency fund, then invest";
      rationale = `Surplus of ${money(s)}: with ${efMonths.toFixed(1)} months saved and no high-APR debt, topping the fund toward 6 months and then investing the rest is reasonable.`;
    } else {
      destination = "Investing / goals";
      rationale = `Surplus of ${money(s)}: emergency fund is funded and there's no high-APR debt, so surplus can go to tax-advantaged then taxable investing or other goals.`;
    }
    surplus = { available: true, income: spending.monthIncome, expenses: spending.monthExpenses, surplus: +s.toFixed(0), destination, rationale };
  }

  const hasAnyData = nw.items.length > 0 || spending.available || debts.length > 0;

  return {
    generatedAt,
    netWorth: nw.netWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    liquidCash: +liquidCash.toFixed(0),
    avgMonthlyExpenses,
    steps,
    surplus,
    spending,
    hasAnyData,
    dataSources,
  };
}
