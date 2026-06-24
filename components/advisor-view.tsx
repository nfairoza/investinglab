"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Sparkles, RefreshCw, MessageCircle, CheckCircle2, Clock, AlertTriangle,
  HelpCircle, ArrowRight, ShieldQuestion, TrendingUp, Wallet, PiggyBank,
} from "lucide-react";
import { AiThinking } from "./ai-thinking";
import { useIsAdmin } from "./use-is-admin";

// ── Types mirror lib/advisor/engine.ts ───────────────────────────────────────
type StepStatus = "done" | "in_progress" | "attention" | "missing_data";
interface ComputedFact { label: string; value: string }
interface AdvisorStep {
  id: string; rank: number; title: string; status: StepStatus;
  priority: "high" | "medium" | "low"; computedFacts: ComputedFact[];
  mathSummary: string; explanationInput: string; missingData?: string[];
  cta?: { label: string; href: string };
}
interface SurplusRouting { available: boolean; income: number; expenses: number; surplus: number; destination: string; rationale: string; missing?: string }
interface SpendingInsights {
  available: boolean; monthIncome: number; monthExpenses: number; net: number;
  topCategories: { category: string; amount: number }[];
  topMerchants: { merchant: string; amount: number }[];
  recurring: { merchant: string; amount: number; months: number }[];
  movers: { category: string; thisMonth: number; lastMonth: number; deltaPct: number }[];
}
interface AdvisorResult {
  generatedAt: string; netWorth: number; totalAssets: number; totalLiabilities: number;
  liquidCash: number; avgMonthlyExpenses: number | null; steps: AdvisorStep[];
  surplus: SurplusRouting; spending: SpendingInsights; hasAnyData: boolean; dataSources: string[];
}
interface Narration { headline: string; summary: string; stepNarration: Record<string, string>; surplusNote: string; spendingNote: string }
interface ApiResp { result: AdvisorResult; narration: Narration | null; model: string | null; generatedAt?: string | null; cached?: boolean; error?: string; message?: string }

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const STATUS_META: Record<StepStatus, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  done: { label: "On track", icon: CheckCircle2, cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  in_progress: { label: "In progress", icon: Clock, cls: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  attention: { label: "Needs attention", icon: AlertTriangle, cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  missing_data: { label: "Add data", icon: HelpCircle, cls: "text-ink-faint border-hairline bg-surface" },
};

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return iso; }
}

export function AdvisorView() {
  const isAdmin = useIsAdmin();
  const [data, setData] = useState<ApiResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  // Auto-load on mount via GET (no click): serves the cached daily review and
  // auto-generates it when warranted (first time, or significant change in
  // daytime within the 3/day cap). Users never click "review".
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    (async () => {
      setBusy(true); setError(null);
      try {
        const r = await fetch("/api/advisor");
        const j: ApiResp = await r.json();
        if (!r.ok || j.error) {
          if (j.error === "no_data" || j.error === "unauthorized") { setError(j.message ?? "Connect an account to get started."); return; }
        }
        setData(j);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally { setBusy(false); }
    })();
  }, []);

  // Explicit refresh (admin-only button) — forces a fresh narration.
  async function run() {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/advisor${isAdmin ? "?force=1" : ""}`, { method: "POST" });
      const j: ApiResp = await r.json();
      if (!r.ok || j.error) {
        if (j.error === "no_data") { setError(j.message ?? "Connect an account to get started."); return; }
        setError(j.message ?? "Couldn't generate your review."); return;
      }
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }

  if (busy && !data) return <div className="rounded-2xl glass p-6"><AiThinking /></div>;

  // Genuinely no data to work with (nothing connected).
  if (!data || (!data.result?.hasAnyData && !data.narration)) {
    return (
      <div className="rounded-2xl glass p-6 text-center">
        <Sparkles className="mx-auto text-brand-400" size={28} />
        <h2 className="mt-2 text-lg font-semibold text-ink">Connect an account to get your plan</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Rukmani checks your emergency fund, high-interest debt, surplus, and spending against the
          classic money priorities — then explains what to focus on first. Connect a bank or add a
          holding and your review appears here automatically.
        </p>
        <button onClick={() => window.dispatchEvent(new Event("open-add"))} className="btn-gold mx-auto mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
          <Sparkles size={15} /> Connect an account
        </button>
        {error && <p className="mt-3 text-xs text-rose-400">{error} <Link href="/settings" className="underline">Settings</Link></p>}
        <Disclaimer />
      </div>
    );
  }

  const { result, narration, model } = data!;
  const nextStep = result.steps.find((s) => s.status === "attention") ?? result.steps.find((s) => s.status === "in_progress");

  return (
    <div className="space-y-4">
      {/* Headline + key numbers */}
      <div className="rounded-2xl glass p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-brand-300"><Sparkles size={15} /><span className="text-xs font-medium uppercase tracking-wide">Rukmani&apos;s plan</span></div>
            <h2 className="mt-1 text-lg font-semibold text-ink">{narration?.headline ?? "Your money, in priority order"}</h2>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold text-ink">{money(result.netWorth)}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">net worth</div>
          </div>
        </div>
        {narration?.summary && <p className="mt-3 text-sm text-ink-dim">{narration.summary}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Liquid cash" value={money(result.liquidCash)} />
          <Stat label="Avg expenses/mo" value={result.avgMonthlyExpenses != null ? money(result.avgMonthlyExpenses) : "—"} />
          <Stat label="Assets" value={money(result.totalAssets)} />
          <Stat label="Liabilities" value={money(result.totalLiabilities)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Refresh is admin-only — users get an auto, cached daily review. */}
          {isAdmin && (
            <button onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink disabled:opacity-50">
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
          )}
          <button onClick={() => window.dispatchEvent(new Event("open-chat"))} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink">
            <MessageCircle size={12} /> Ask a follow-up
          </button>
          {data!.generatedAt && <span className="text-[10px] text-ink-faint">Reviewed {fmtTime(data!.generatedAt)}</span>}
        </div>
      </div>

      {/* Surplus routing */}
      <div className="rounded-2xl glass p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><PiggyBank size={16} className="text-brand-400" /> This month&apos;s surplus</div>
        {result.surplus.available ? (
          <>
            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-1">
              <div><div className="text-[11px] text-ink-faint">Income</div><div className="text-lg font-semibold text-emerald-400">{money(result.surplus.income)}</div></div>
              <div><div className="text-[11px] text-ink-faint">Expenses</div><div className="text-lg font-semibold text-rose-400">{money(result.surplus.expenses)}</div></div>
              <div><div className="text-[11px] text-ink-faint">Surplus</div><div className={`text-lg font-bold ${result.surplus.surplus >= 0 ? "text-ink" : "text-rose-400"}`}>{money(result.surplus.surplus)}</div></div>
              <div className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-sm text-brand-200">
                <ArrowRight size={14} /> {result.surplus.destination}
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-dim">{narration?.surplusNote ?? result.surplus.rationale}</p>
          </>
        ) : (
          <MissingNote text={result.surplus.missing ?? "Surplus can't be computed yet."} href="/spending" cta="Link a checking account" />
        )}
      </div>

      {/* Order-of-operations steps */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-ink">Your order of operations</div>
        {result.steps.map((s) => (
          <StepCard key={s.id} step={s} note={narration?.stepNarration?.[s.id]} highlight={s.id === nextStep?.id} />
        ))}
      </div>

      {/* Spending insights */}
      {result.spending.available && (
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Wallet size={16} className="text-brand-400" /> Spending insights</div>
          {narration?.spendingNote && <p className="mt-2 text-sm text-ink-dim">{narration.spendingNote}</p>}
          {result.spending.topCategories.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Top categories this month</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.spending.topCategories.map((c) => (
                  <span key={c.category} className="rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-[11px] text-ink-dim">{c.category} {money(c.amount)}</span>
                ))}
              </div>
            </div>
          )}
          {result.spending.movers.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Notable changes vs last month</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.spending.movers.map((m) => (
                  <span key={m.category} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] ${m.deltaPct >= 0 ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
                    <TrendingUp size={11} className={m.deltaPct >= 0 ? "" : "rotate-180"} /> {m.category} {m.deltaPct > 0 ? "+" : ""}{m.deltaPct}%
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.spending.recurring.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">Recurring bills & subscriptions</div>
              <ul className="mt-1.5 divide-y divide-hairline rounded-lg border border-hairline">
                {result.spending.recurring.map((r) => (
                  <li key={r.merchant} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="truncate text-ink-dim">{r.merchant}<span className="text-ink-faint"> · {r.months} mo</span></span>
                    <span className="shrink-0 font-medium text-ink">{money(r.amount)}/mo</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href="/spending" className="mt-3 inline-flex items-center gap-1 text-xs text-brand-300 hover:underline">See all spending <ArrowRight size={12} /></Link>
        </div>
      )}

      {!narration && (
        <p className="rounded-lg border border-hairline bg-surface p-3 text-[11px] text-ink-faint">
          AI narration is unavailable right now, so we&apos;re showing the computed plan directly. All figures above are calculated by rukMoney from your accounts.
        </p>
      )}

      <Disclaimer model={model} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function StepCard({ step, note, highlight }: { step: AdvisorStep; note?: string; highlight?: boolean }) {
  const meta = STATUS_META[step.status];
  const Icon = meta.icon;
  return (
    <div className={`rounded-2xl glass p-4 ${highlight ? "ring-1 ring-brand-500/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline text-[11px] font-semibold text-ink-dim">{step.rank}</span>
          <span className="truncate text-sm font-semibold text-ink">{step.title}</span>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}>
          <Icon size={11} /> {meta.label}
        </span>
      </div>

      {step.computedFacts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {step.computedFacts.map((f) => (
            <span key={f.label} className="text-xs text-ink-dim">{f.label} <span className="font-semibold text-ink">{f.value}</span></span>
          ))}
        </div>
      )}
      {step.mathSummary && <p className="mt-1.5 text-[11px] text-ink-faint">{step.mathSummary}</p>}
      {note && <p className="mt-2 text-sm text-ink-dim">{note}</p>}

      {step.missingData && step.missingData.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-hairline bg-surface p-2.5 text-[11px] text-ink-dim">
          <ShieldQuestion size={13} className="mt-0.5 shrink-0 text-ink-faint" />
          <span>Add to improve: {step.missingData.join("; ")}</span>
        </div>
      )}
      {step.cta && (
        <Link href={step.cta.href} className="mt-2.5 inline-flex items-center gap-1 text-xs text-brand-300 hover:underline">
          {step.cta.label} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function MissingNote({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-dim">
      {text}
      <Link href={href} className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-300 hover:underline">{cta} <ArrowRight size={12} /></Link>
    </div>
  );
}

function Disclaimer({ model }: { model?: string | null }) {
  return (
    <div className="space-y-1.5 pt-1">
      <p className="text-[11px] text-ink-faint">
        Rukmani may send selected financial context to the AI provider to generate explanations. Numbers are computed by rukMoney before narration.
      </p>
      <p className="text-[11px] text-ink-faint">
        Educational insights only — not financial, tax, or investment advice.{model ? ` Narrated by ${model}.` : ""}
      </p>
    </div>
  );
}
