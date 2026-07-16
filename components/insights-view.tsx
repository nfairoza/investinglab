"use client";

import { useState } from "react";
import useSWR from "swr";
import { Lightbulb, ChevronDown, X, ThumbsUp, Sparkles, Clock, AlertTriangle } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ArtImage } from "./ui/art-image";
import { AmbientLoader } from "./ambient-loader";
import { optimisticUpdate } from "@/lib/optimistic";
import type { StoredInsight, EvidenceRef } from "@/lib/insights/types";

const KEY = "/api/insights";

// Mirror of the API's InsightsDiagnosis (Q7). Distinguishes 'analyzing now' from
// 'genuinely too little history' from 'pipeline error' so the empty state never
// blames little history when the real state is "not yet processed".
type InsightsState = "ready" | "analyzing" | "too_little" | "error" | "empty";
interface Diagnosis {
  state: InsightsState;
  monthsOfData: number;
  weeksOfData: number;
  backfill: { state: string; monthsOfData: number; transactions: number } | null;
}
interface InsightsResp { insights: StoredInsight[]; diagnosis?: Diagnosis }

// Severity → soft tint (neutral / amber / soft-red). Positive insights always
// read as a gentle positive regardless of severity.
function tint(ins: StoredInsight): string {
  if (ins.positive) return "border-emerald-500/30 bg-emerald-500/[0.06]";
  if (ins.severity >= 3) return "border-rose-500/30 bg-rose-500/[0.06]";
  if (ins.severity === 2) return "border-amber-500/30 bg-amber-500/[0.06]";
  return "border-hairline bg-surface";
}

async function patchStatus(id: string, status: StoredInsight["status"]) {
  // Optimistic: drop it from the local list immediately; roll back + toast on error.
  await optimisticUpdate<{ insights: StoredInsight[] }>({
    key: KEY,
    current: undefined,
    optimistic: (cur) => (cur ? { insights: cur.insights.filter((i) => i.id !== id) } : { insights: [] }),
    request: async () => {
      const r = await fetch(KEY, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (!r.ok) throw new Error(`insight ${r.status}`);
    },
    errorMessage: "Couldn't update that insight — it's back in your list.",
  });
}

function Why({ evidence }: { evidence: EvidenceRef[] }) {
  return (
    <div className="mt-3 rounded-lg border border-hairline bg-surface-raised/60 p-3 text-xs text-ink-dim">
      {evidence.map((e, i) => (
        <div key={i} className={i > 0 ? "mt-2" : ""}>
          <div className="text-ink-faint">{e.note}</div>
          {e.rows && e.rows.length > 0 && (
            <table className="mt-1.5 w-full">
              <tbody>
                {e.rows.slice(0, 12).map((r) => (
                  <tr key={r.transactionId} className="border-t border-hairline/60">
                    <td className="py-1 pr-2 text-ink-faint">{r.date}</td>
                    <td className="py-1 pr-2 text-ink">{r.label}</td>
                    <td className="py-1 text-right tabular-nums text-ink">${r.amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}

function InsightRow({ ins }: { ins: StoredInsight }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border p-4 ${tint(ins)}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-brand-400">{ins.positive ? <Sparkles size={18} /> : <Lightbulb size={18} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{ins.headline}</div>
          <div className="mt-0.5 text-sm text-ink-dim">{ins.body}</div>
          {ins.slots?.limitedHistory ? (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-faint">
              <Clock size={11} /> Based on limited history so far
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-brand-400 hover:underline">
              Show me why <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {ins.action && <a href={ins.action.deeplink} className="text-ink-dim hover:text-ink">{ins.action.label} →</a>}
            <button onClick={() => patchStatus(ins.id, "done")} className="text-ink-faint hover:text-emerald-400">I did this</button>
            <button onClick={() => patchStatus(ins.id, "muted")} className="inline-flex items-center gap-1 text-ink-faint hover:text-ink-dim"><ThumbsUp size={12} className="rotate-180" /> Not for me</button>
          </div>
          {open && <Why evidence={ins.evidence} />}
        </div>
        <button onClick={() => patchStatus(ins.id, "dismissed")} aria-label="Dismiss" className="shrink-0 text-ink-faint hover:text-ink"><X size={16} /></button>
      </div>
    </div>
  );
}

// Centered state card. Wrapping in a full-width flex fixes the layout bug where
// the card floated in the right half with the left half blank (the card wasn't
// forced to center within the content column).
function StateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full justify-center">
      <div className="w-full max-w-xl rounded-2xl glass p-8 text-center">{children}</div>
    </div>
  );
}

export function InsightsView() {
  const { data, isLoading } = useSWR<InsightsResp>(KEY, fetchJson, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    // While the backfill is analyzing, poll so the first insights appear as soon
    // as the pipeline finishes (within minutes) without a manual refresh.
    refreshInterval: (latest) => (latest?.diagnosis?.state === "analyzing" ? 5000 : 0),
  });
  const insights = data?.insights ?? [];
  const diag = data?.diagnosis;

  // Skeleton is FIRST-VISIT-ONLY (S2): show it only when we have no data at all.
  if (!data && isLoading) return <div className="rounded-2xl glass p-6 text-sm text-ink-faint">Loading your insights…</div>;

  if (insights.length > 0) {
    return <div className="space-y-3">{insights.map((ins) => <InsightRow key={ins.id} ins={ins} />)}</div>;
  }

  // ── Analyzing now — the first-insights moment. Show real progress with the
  // ambient loader, not an "empty" message. ─────────────────────────────────
  if (diag?.state === "analyzing") {
    const months = diag.backfill?.monthsOfData || diag.monthsOfData || 0;
    const label = months > 0
      ? `Analyzing ${months} month${months === 1 ? "" : "s"} of history…`
      : "Pulling in your full transaction history…";
    return (
      <StateCard>
        <AmbientLoader variant="money" height={200} messages={[label, "Building your monthly cash-flow…", "Looking for what's worth a look…"]} />
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-dim">
          We&apos;re reading your full transaction history and building your first insights. This usually takes a couple of minutes — no need to wait here.
        </p>
      </StateCard>
    );
  }

  // ── Pipeline error — honest, not blamed on the data. ──────────────────────
  if (diag?.state === "error") {
    return (
      <StateCard>
        <AlertTriangle size={28} className="mx-auto mb-3 text-amber-400" />
        <h2 className="text-lg font-semibold text-ink">We hit a snag building your insights</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Something went wrong while analyzing your history — this is on us, not your accounts. It&apos;ll retry automatically tonight, or you can try again.
        </p>
        <button
          onClick={() => fetch("/api/plaid/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) }).catch(() => {})}
          className="mt-4 rounded-lg border border-hairline px-4 py-2 text-sm text-ink-dim hover:bg-surface hover:text-ink"
        >
          Try again
        </button>
      </StateCard>
    );
  }

  // ── Genuinely too little history (under ~6 weeks). ────────────────────────
  if (diag?.state === "too_little") {
    return (
      <StateCard>
        <Clock size={28} className="mx-auto mb-3 text-ink-faint" />
        <h2 className="text-lg font-semibold text-ink">A little more history and we&apos;re set</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Your accounts have under about six weeks of activity so far. Once there&apos;s a bit more, Rukmani will start surfacing spending that&apos;s running high, cash that could work harder, and wins worth celebrating.
        </p>
      </StateCard>
    );
  }

  // ── Default empty: processed, enough history, nothing worth flagging (or no
  // accounts linked yet). ───────────────────────────────────────────────────
  return (
    <StateCard>
      <ArtImage name="empty-insights" alt="" className="mx-auto mb-3 h-32 w-auto opacity-95" sizes="480px" />
      <h2 className="text-lg font-semibold text-ink">You&apos;re all clear right now</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
        Nothing needs your attention at the moment. Rukmani keeps watching your money and will surface what&apos;s worth a look — spending that&apos;s running high, cash that could work harder, and wins worth celebrating.
      </p>
    </StateCard>
  );
}
