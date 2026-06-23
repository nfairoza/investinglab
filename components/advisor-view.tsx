"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, AlertTriangle, CheckCircle2, ArrowRight, RefreshCw, MessageCircle } from "lucide-react";
import { AiThinking } from "./ai-thinking";

interface Risk { title: string; detail: string; severity: "low" | "medium" | "high" }
interface Action { title: string; why: string; priority: number }
interface Review {
  headline: string; healthScore: number; summary: string;
  strengths: string[]; risks: Risk[]; actions: Action[]; spendingInsight: string;
}
interface Result { review: Review; model: string; netWorth: number; cached?: boolean; generatedAt?: string }

const SEV: Record<string, string> = {
  high: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-hairline bg-surface text-ink-dim",
};

function scoreColor(n: number) {
  if (n >= 70) return "text-emerald-400";
  if (n >= 45) return "text-amber-400";
  return "text-rose-400";
}

export function AdvisorView() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(refresh = false) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/advisor${refresh ? "?refresh=1" : ""}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setError(j.message ?? "Couldn't generate your review."); return; }
      setResult(j as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }

  if (!result && !busy) {
    return (
      <div className="rounded-2xl glass p-6 text-center">
        <Sparkles className="mx-auto text-brand-400" size={28} />
        <h2 className="mt-2 text-lg font-semibold text-ink">Ask Rukmani to review your finances</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Rukmani looks at your net worth, accounts, holdings, and recent spending, then gives a
          personalized health check with prioritized next steps.
        </p>
        <button onClick={() => run(false)} className="btn-gold mx-auto mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
          <Sparkles size={15} /> Review my finances
        </button>
        {error && (
          <p className="mt-3 text-xs text-rose-400">
            {error} {error.includes("Connect a bank") && <Link href="/settings" className="underline">Go to Settings</Link>}
          </p>
        )}
      </div>
    );
  }

  if (busy && !result) {
    return <div className="rounded-2xl glass p-6"><AiThinking /></div>;
  }

  const rv = result!.review;
  return (
    <div className="space-y-5">
      {/* Headline + score */}
      <div className="rounded-2xl glass p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-brand-300"><Sparkles size={15} /><span className="text-xs font-medium uppercase tracking-wide">Rukmani&apos;s review</span></div>
            <h2 className="mt-1 text-lg font-semibold text-ink">{rv.headline}</h2>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-3xl font-bold ${scoreColor(rv.healthScore)}`}>{rv.healthScore}</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">health</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-dim">{rv.summary}</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => run(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink disabled:opacity-50">
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={() => window.dispatchEvent(new Event("open-chat"))} className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1 text-[11px] text-ink-dim hover:bg-surface hover:text-ink">
            <MessageCircle size={12} /> Ask a follow-up
          </button>
          {result?.cached && <span className="text-[10px] text-ink-faint">cached</span>}
        </div>
      </div>

      {/* Strengths + risks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300"><CheckCircle2 size={15} /> Strengths</div>
          <ul className="mt-3 space-y-2">
            {rv.strengths.map((s, i) => <li key={i} className="text-sm text-ink-dim">• {s}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl glass p-5">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-300"><AlertTriangle size={15} /> Risks to watch</div>
          <ul className="mt-3 space-y-2">
            {rv.risks.map((r, i) => (
              <li key={i} className="rounded-lg border border-hairline p-2.5 text-sm">
                <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ${SEV[r.severity] ?? SEV.low}`}>{r.severity}</span>
                <span className="font-medium text-ink">{r.title}</span>
                <p className="mt-1 text-xs text-ink-dim">{r.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-2xl glass p-5">
        <div className="text-sm font-semibold text-ink">Your next steps</div>
        <ol className="mt-3 space-y-2">
          {[...rv.actions].sort((a, b) => a.priority - b.priority).map((a, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-hairline bg-surface p-3">
              <ArrowRight size={16} className="mt-0.5 shrink-0 text-brand-400" />
              <div>
                <div className="text-sm font-medium text-ink">{a.title}</div>
                <div className="text-xs text-ink-dim">{a.why}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {rv.spendingInsight && (
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] p-4 text-sm text-ink-dim">
          <span className="font-medium text-brand-300">Spending note:</span> {rv.spendingInsight}
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Education only — not individualized financial, investment, or tax advice. Generated by {result?.model}.
      </p>
    </div>
  );
}
