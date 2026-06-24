"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Stethoscope, RefreshCw, Scissors, ArrowRight, Eye, AlertTriangle, Lightbulb,
  PiggyBank, Repeat, Wallet, TrendingDown, ShieldCheck,
} from "lucide-react";

interface Analysis { summary: string; cut: string[]; redirect: string[]; watch: string[]; alarming?: string[]; ideas?: string[] }
interface DoctorResp { analysis: Analysis | null; model: string | null; generatedAt: string | null; cached?: boolean }

// Advisor GET (computed, no AI tokens) for the hard numbers shown alongside the
// narrative checkup.
interface AdvisorStep { id: string; title: string; status: string; mathSummary: string; computedFacts: { label: string; value: string }[] }
interface AdvisorResp { result?: {
  liquidCash: number; avgMonthlyExpenses: number | null; netWorth: number; totalLiabilities: number;
  steps: AdvisorStep[];
  surplus: { available: boolean; surplus: number; destination: string; income: number; expenses: number };
  spending: { available: boolean; monthIncome: number; monthExpenses: number; net: number; recurring: { merchant: string; amount: number; months: number }[]; topCategories: { category: string; amount: number }[] };
} }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export function AccountsDoctor() {
  const [data, setData] = useState<DoctorResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ranAuto = useRef(false);
  const { data: advisor } = useSWR<AdvisorResp>("/api/advisor", fetchJson, { revalidateOnFocus: false });

  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/money/analysis", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setErr(j.message ?? "Couldn't run the checkup."); return; }
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  // Load cached checkup on mount (no tokens). Leave the CTA if there's none.
  useEffect(() => {
    if (ranAuto.current) return;
    ranAuto.current = true;
    (async () => {
      try {
        const j: DoctorResp = await fetch("/api/money/analysis").then((r) => r.json());
        if (j.analysis) setData(j);
      } catch { /* ignore */ }
    })();
  }, []);

  const r = advisor?.result;
  const runway = r?.avgMonthlyExpenses && r.avgMonthlyExpenses > 0 ? r.liquidCash / r.avgMonthlyExpenses : null;
  const savingsRate = r?.spending.available && r.spending.monthIncome > 0
    ? Math.round((r.spending.net / r.spending.monthIncome) * 100) : null;
  const recurringTotal = (r?.spending.recurring ?? []).reduce((s, x) => s + x.amount, 0);
  const debtStep = r?.steps.find((s) => s.id === "high_interest_debt");
  const efStep = r?.steps.find((s) => s.id === "emergency_fund");

  // Simple health grade from the computed facts (deterministic, not AI).
  const grade = (() => {
    if (!r) return null;
    let score = 70;
    if (runway != null) score += runway >= 6 ? 15 : runway >= 3 ? 5 : -20;
    if (savingsRate != null) score += savingsRate >= 20 ? 10 : savingsRate >= 0 ? 0 : -15;
    if (debtStep?.status === "attention") score -= 15;
    if (r.spending.available && r.spending.net < 0) score -= 10;
    return Math.max(5, Math.min(99, Math.round(score)));
  })();
  const gradeColor = grade == null ? "text-ink" : grade >= 70 ? "text-emerald-400" : grade >= 45 ? "text-amber-400" : "text-rose-400";

  const a = data?.analysis ?? null;
  const when = data?.generatedAt ? new Date(data.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <div className="space-y-5">
      {/* Headline: health grade + key vitals (computed) */}
      <div className="rounded-2xl glass p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-brand-300"><Stethoscope size={15} /><span className="text-xs font-medium uppercase tracking-wide">Accounts checkup</span></div>
            <h2 className="mt-1 text-lg font-semibold text-ink">Your money health</h2>
          </div>
          {grade != null && (
            <div className="shrink-0 text-right">
              <div className={`text-3xl font-bold ${gradeColor}`}>{grade}</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">health</div>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Vital icon={Wallet} label="Cash on hand" value={money(r?.liquidCash)} />
          <Vital icon={ShieldCheck} label="Cash runway" value={runway != null ? `${runway.toFixed(1)} mo` : "—"} />
          <Vital icon={PiggyBank} label="Savings rate" value={savingsRate != null ? `${savingsRate}%` : "—"} />
          <Vital icon={TrendingDown} label="Liabilities" value={money(r?.totalLiabilities)} />
        </div>
      </div>

      {/* Computed detail: cashflow, emergency fund, debt, recurring */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">This month&apos;s cashflow</div>
          {r?.spending.available ? (
            <div className="mt-3 space-y-2 text-sm">
              <Line label="Income" value={money(r.spending.monthIncome)} tone="emerald" />
              <Line label="Expenses" value={money(r.spending.monthExpenses)} tone="rose" />
              <div className="flex items-center justify-between border-t border-hairline pt-2 font-semibold">
                <span className="text-ink">Net</span>
                <span className={r.spending.net >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(r.spending.net)}</span>
              </div>
              {r.surplus.available && r.surplus.surplus > 0 && (
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
                  <ArrowRight size={13} /> Spare {money(r.surplus.surplus)} → {r.surplus.destination}
                </div>
              )}
            </div>
          ) : <MissingLine href="/transactions" text="Link a checking account to see cashflow." />}
        </div>

        <div className="rounded-2xl glass p-5">
          <div className="text-sm font-semibold text-ink">Emergency fund &amp; debt</div>
          <div className="mt-3 space-y-2 text-sm text-ink-dim">
            {efStep?.mathSummary ? <p>{efStep.mathSummary}</p> : <p className="text-ink-faint">Emergency-fund runway needs linked cash + spending.</p>}
            {debtStep && debtStep.computedFacts.length > 0 ? (
              <div className="rounded-lg border border-hairline bg-surface p-2.5">
                {debtStep.computedFacts.map((f) => (
                  <div key={f.label} className="flex justify-between text-xs"><span className="text-ink-faint">{f.label}</span><span className="font-medium text-ink">{f.value}</span></div>
                ))}
                {debtStep.mathSummary && <p className="mt-1.5 text-[11px] text-ink-faint">{debtStep.mathSummary}</p>}
              </div>
            ) : <p className="text-ink-faint">No debt linked.</p>}
          </div>
        </div>
      </div>

      {/* Recurring bills */}
      {(r?.spending.recurring.length ?? 0) > 0 && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Repeat size={16} className="text-brand-400" /> Recurring bills</div>
            <span className="text-xs text-ink-faint">~{money(recurringTotal)}/mo</span>
          </div>
          <ul className="mt-3 divide-y divide-hairline">
            {r!.spending.recurring.slice(0, 8).map((x) => (
              <li key={x.merchant} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate text-ink-dim">{x.merchant}<span className="text-ink-faint"> · {x.months} mo</span></span>
                <span className="shrink-0 font-medium text-ink">{money(x.amount)}/mo</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI narrative checkup */}
      <div className="rounded-2xl glass p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Stethoscope size={16} className="text-brand-400" /> Rukmani&apos;s diagnosis</div>
          <div className="flex items-center gap-2">
            {when && <span className="text-[10px] text-ink-faint">as of {when}</span>}
            <button onClick={run} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink disabled:opacity-50">
              <RefreshCw size={11} className={busy ? "animate-spin" : ""} /> {a ? "Re-analyze" : "Run checkup"}
            </button>
          </div>
        </div>
        {busy && !a && <p className="text-sm text-ink-dim">Running your checkup…</p>}
        {err && <p className="text-xs text-rose-400">{err}</p>}
        {!a && !busy && !err && <p className="text-sm text-ink-dim">Run a checkup for a plain-English diagnosis — what to cut, where money should go, anything alarming, and ideas. Cached for a day to save tokens.</p>}
        {a && (
          <>
            {a.summary && <p className="text-sm text-ink-dim">{a.summary}</p>}
            {a.alarming && a.alarming.length > 0 && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3"><Block icon={AlertTriangle} title="Worth attention now" items={a.alarming} cls="text-rose-300" /></div>
            )}
            <Block icon={Scissors} title="Where to consider cutting" items={a.cut} cls="text-amber-300" />
            <Block icon={ArrowRight} title="Where the money could go" items={a.redirect} cls="text-emerald-300" />
            <Block icon={Eye} title="Keep an eye on" items={a.watch} cls="text-sky-300" />
            {a.ideas && a.ideas.length > 0 && <Block icon={Lightbulb} title="Ideas" items={a.ideas} cls="text-violet-300" />}
            <p className="text-[11px] text-ink-faint">Numbers computed by rukMoney before narration{data?.model ? ` · narrated by ${data.model}` : ""}. Cached for a day. Educational only — not financial advice.</p>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/spending" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface hover:text-ink">Spending →</Link>
        <Link href="/transactions" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface hover:text-ink">Transactions →</Link>
        <Link href="/accounts" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface hover:text-ink">Accounts →</Link>
        <Link href="/advisor" className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface hover:text-ink">Full advisor plan →</Link>
      </div>
    </div>
  );
}

function Vital({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-ink-faint"><Icon size={11} /> {label}</div>
      <div className="mt-0.5 text-base font-semibold text-ink">{value}</div>
    </div>
  );
}
function Line({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-dim">{label}</span>
      <span className={tone === "emerald" ? "text-emerald-400" : "text-rose-400"}>{value}</span>
    </div>
  );
}
function MissingLine({ text, href }: { text: string; href: string }) {
  return <div className="mt-3 text-sm text-ink-dim">{text} <Link href={href} className="text-brand-300 hover:underline">Link →</Link></div>;
}
function Block({ icon: Icon, title, items, cls }: { icon: typeof Scissors; title: string; items: string[]; cls: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${cls}`}><Icon size={13} /> {title}</div>
      <ul className="mt-1.5 space-y-1">{items.map((it, i) => <li key={i} className="text-sm text-ink-dim">• {it}</li>)}</ul>
    </div>
  );
}
