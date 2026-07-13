"use client";

import { useState } from "react";
import useSWR from "swr";
import { Lightbulb, ChevronDown, X, ThumbsUp, Sparkles } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ArtImage } from "./ui/art-image";
import { optimisticUpdate } from "@/lib/optimistic";
import type { StoredInsight, EvidenceRef } from "@/lib/insights/types";

const KEY = "/api/insights";

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

export function InsightsView() {
  const { data, isLoading } = useSWR<{ insights: StoredInsight[] }>(KEY, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const insights = data?.insights ?? [];

  // Skeleton is FIRST-VISIT-ONLY (S2): show it only when we have no data at all
  // (never fetched). Once we have any data — even stale/previous — render it and
  // let the background revalidation update it in place; never skeleton over it.
  if (!data && isLoading) return <div className="rounded-2xl glass p-6 text-sm text-ink-faint">Loading your insights…</div>;

  if (insights.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl glass p-8 text-center">
        <ArtImage name="empty-insights" alt="" className="mx-auto mb-3 h-32 w-auto opacity-95" sizes="480px" />
        <h2 className="text-lg font-semibold text-ink">No insights yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Once your accounts have a little history, Rukmani will surface what&apos;s worth a look —
          spending that&apos;s running high, cash that could work harder, and wins worth celebrating.
        </p>
      </div>
    );
  }

  return <div className="space-y-3">{insights.map((ins) => <InsightRow key={ins.id} ins={ins} />)}</div>;
}
