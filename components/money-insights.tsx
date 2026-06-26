"use client";

import useSWR from "swr";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Sparkles, AlertTriangle, ArrowUpRight, ArrowDownRight, Repeat, Wallet, CircleSlash } from "lucide-react";

interface CategoryAnomaly { category: string; thisMonth: number; typicalMonth: number; deltaPct: number; deltaAmount: number; isNew: boolean; direction: "up" | "down" }
interface BillChange { merchant: string; previousAmount: number; newAmount: number; deltaPct: number; deltaAmount: number; stableMonths: number; changedOn: string; direction: "up" | "down" }
interface BillTrend { merchant: string; points: { month: string; amount: number }[]; latest: number; min: number; max: number; avg: number }
interface IncomeChange { source: string; kind: "raised" | "lowered" | "stopped"; previousAmount: number; newAmount: number; deltaPct: number; deltaAmount: number; stableMonths: number; lastSeen: string }
interface Insights { available: boolean; monthsOfData: number; categoryAnomalies: CategoryAnomaly[]; billChanges: BillChange[]; billTrends: BillTrend[]; incomeChanges: IncomeChange[] }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const money2 = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

function ask(prompt: string) {
  window.dispatchEvent(new CustomEvent("ask-rukmani", { detail: { prompt } }));
}

// Money insights: deterministic spending anomalies, recurring-bill price
// changes, and variable-bill trend plots. `compact` shows only the headline
// anomaly + bill changes (for Overview); full shows everything incl. plots.
export function MoneyInsights({ compact = false }: { compact?: boolean }) {
  const { data } = useSWR<Insights>("/api/money/insights", fetchJson, { revalidateOnFocus: false });
  if (!data || !data.available) return null;

  const { categoryAnomalies, billChanges, billTrends, incomeChanges = [], monthsOfData } = data;
  const hasAny = categoryAnomalies.length || billChanges.length || billTrends.length || incomeChanges.length;
  if (!hasAny) return null;

  // Compact: the single most notable item, income changes first (Overview).
  if (compact) {
    const topIncome = incomeChanges[0];
    const topBill = billChanges[0];
    const topCat = categoryAnomalies[0];
    if (!topIncome && !topBill && !topCat) return null;
    return (
      <div className="rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={16} className="text-brand-400" /> Spotted in your money</div>
        <div className="mt-3 space-y-2">
          {topIncome && <IncomeChangeRow c={topIncome} />}
          {topBill && <BillChangeRow b={topBill} />}
          {!topIncome && topCat && <AnomalyRow a={topCat} />}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Income changes — paycheck/deposit raised, lowered, or stopped */}
      {incomeChanges.length > 0 && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Wallet size={16} className="text-brand-400" /> Income changes</div>
          <p className="mt-0.5 text-xs text-ink-faint">Regular deposits that changed amount or stopped.</p>
          <div className="mt-3 space-y-2">
            {incomeChanges.map((c) => <IncomeChangeRow key={c.source} c={c} />)}
          </div>
        </div>
      )}
      {/* Recurring-bill price changes */}
      {billChanges.length > 0 && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Repeat size={16} className="text-brand-400" /> Bill changes</div>
          <p className="mt-0.5 text-xs text-ink-faint">Recurring charges that stepped up or down after holding steady.</p>
          <div className="mt-3 space-y-2">
            {billChanges.map((b) => <BillChangeRow key={b.merchant} b={b} />)}
          </div>
        </div>
      )}

      {/* Variable-bill trends (utilities) */}
      {billTrends.length > 0 && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><TrendingUp size={16} className="text-brand-400" /> Bills that move</div>
          <p className="mt-0.5 text-xs text-ink-faint">Variable bills (utilities and the like) over the last year.</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {billTrends.map((t) => <BillTrendCard key={t.merchant} t={t} />)}
          </div>
        </div>
      )}

      {/* Category anomalies */}
      {categoryAnomalies.length > 0 && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><AlertTriangle size={16} className="text-amber-400" /> Unusual this month</div>
          <p className="mt-0.5 text-xs text-ink-faint">Categories where this month differs from your own typical spend.</p>
          <div className="mt-3 space-y-2">
            {categoryAnomalies.map((a) => <AnomalyRow key={a.category} a={a} />)}
          </div>
        </div>
      )}

      {monthsOfData < 3 && (
        <p className="text-[11px] text-ink-faint">Only {monthsOfData} month{monthsOfData !== 1 ? "s" : ""} of history so far — these insights sharpen as more transactions accumulate.</p>
      )}
    </div>
  );
}

function BillChangeRow({ b }: { b: BillChange }) {
  const up = b.direction === "up";
  return (
    <button onClick={() => ask(`My recurring charge for ${b.merchant} changed from ${money2(b.previousAmount)} to ${money2(b.newAmount)} after ${b.stableMonths} steady months. Is this a price hike, and what are my options?`)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-left transition-colors hover:brightness-110">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {b.merchant}
          <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] ${up ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
            {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} {up ? "+" : ""}{b.deltaPct}%
          </span>
        </div>
        <div className="text-[11px] text-ink-faint">
          {money2(b.previousAmount)} → <span className="text-ink-dim">{money2(b.newAmount)}</span> · steady {b.stableMonths} mo before {b.direction === "up" ? "the hike" : "the drop"}
        </div>
      </div>
      <span className={`shrink-0 text-sm font-semibold ${up ? "text-rose-400" : "text-emerald-400"}`}>{up ? "+" : "−"}{money2(Math.abs(b.deltaAmount))}/mo</span>
    </button>
  );
}

function IncomeChangeRow({ c }: { c: IncomeChange }) {
  const stopped = c.kind === "stopped";
  const up = c.kind === "raised";
  const cls = stopped ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : up ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/40 bg-rose-500/10 text-rose-300";
  const label = stopped ? "stopped" : up ? `+${c.deltaPct}%` : `${c.deltaPct}%`;
  return (
    <button onClick={() => window.dispatchEvent(new CustomEvent("ask-rukmani", { detail: { prompt: stopped
        ? `A regular deposit from ${c.source} (about ${money2(c.previousAmount)}) hasn't come in since ${c.lastSeen}. What might that mean and what should I check?`
        : `My income from ${c.source} ${up ? "went up" : "went down"} from ${money2(c.previousAmount)} to ${money2(c.newAmount)} (${c.deltaPct > 0 ? "+" : ""}${c.deltaPct}%). How should I think about this change?` } }))}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-left transition-colors hover:brightness-110">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {c.source}
          <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] ${cls}`}>
            {stopped ? <CircleSlash size={10} /> : up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} {label}
          </span>
        </div>
        <div className="text-[11px] text-ink-faint">
          {stopped
            ? <>was {money2(c.previousAmount)} · last seen {c.lastSeen}</>
            : <>{money2(c.previousAmount)} → <span className="text-ink-dim">{money2(c.newAmount)}</span> · steady {c.stableMonths} mo before</>}
        </div>
      </div>
      <span className={`shrink-0 text-sm font-semibold ${stopped ? "text-amber-400" : up ? "text-emerald-400" : "text-rose-400"}`}>
        {stopped ? "paused" : `${up ? "+" : "−"}${money2(Math.abs(c.deltaAmount))}/mo`}
      </span>
    </button>
  );
}

function AnomalyRow({ a }: { a: CategoryAnomaly }) {
  const up = a.direction === "up";
  // Click → open Transactions filtered to this category, so the user can see the
  // exact transactions that make up the figure and drill into any one of them.
  // The ⊕ "ask" button stays as a secondary action to query Rukmani.
  return (
    <div className="flex items-center gap-2">
      <Link href={`/transactions?category=${encodeURIComponent(a.category)}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-left transition-colors hover:brightness-110">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">{a.category}</div>
          <div className="text-[11px] text-ink-faint">
            {a.isNew ? "New this month — tap to see the transactions" : <>This month {money(a.thisMonth)} · usually ~{money(a.typicalMonth)} · tap to see transactions</>}
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 text-sm font-semibold ${up ? "text-amber-400" : "text-emerald-400"}`}>
          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {a.isNew ? money(a.thisMonth) : `${up ? "+" : ""}${money(a.deltaAmount)}`}
        </span>
      </Link>
      <button onClick={() => ask(a.isNew
        ? `I spent ${money(a.thisMonth)} on ${a.category} this month — a category I don't usually spend on. Help me understand whether that's worth watching.`
        : `I spent ${money(a.thisMonth)} on ${a.category} this month vs my usual ~${money(a.typicalMonth)}. Why might that be, and should I be concerned?`)}
        title="Ask Rukmani about this" aria-label="Ask Rukmani"
        className="shrink-0 rounded-lg border border-hairline bg-surface p-2 text-ink-faint transition-colors hover:text-brand-300">
        <Sparkles size={15} />
      </button>
    </div>
  );
}

function BillTrendCard({ t }: { t: BillTrend }) {
  const id = `bt-${t.merchant.replace(/\W/g, "")}`;
  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className="truncate text-sm font-medium text-ink">{t.merchant}</span>
        <span className="shrink-0 text-sm font-semibold text-ink">{money2(t.latest)}</span>
      </div>
      <div className="text-[11px] text-ink-faint">range {money2(t.min)}–{money2(t.max)} · avg {money2(t.avg)}</div>
      <div className="mt-2 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={t.points} margin={{ top: 4, right: 2, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0EA6C9" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0EA6C9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip formatter={(v: number) => money2(v)} labelFormatter={(l: string) => l}
              contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-strong)", borderRadius: 10, fontSize: 12, color: "var(--text)" }} />
            <Area type="monotone" dataKey="amount" stroke="#0EA6C9" strokeWidth={2} fill={`url(#${id})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
