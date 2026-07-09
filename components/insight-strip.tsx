"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Lightbulb, Sparkles, ChevronDown, X } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import type { StoredInsight, EvidenceRef } from "@/lib/insights/types";

// Stage-3 contextual strip: ONE insight rendered adjacent to the data it derives
// from. `page` selects which insight kinds belong here (an insight's kind maps to
// a page). Max one per page; severity tint; inline "why"; dismiss. Renders
// nothing when nothing relevant — never a placeholder.
//
// Shares the same /api/insights SWR key as the archive + Home, so a dismissal
// here suppresses the insight everywhere instantly.
const KEY = "/api/insights?active=1";

// kind → page placement matrix (mirrors the generators' `page`).
const PAGE_KINDS: Record<string, string[]> = {
  spending: ["pace_anomaly", "category_trend", "positive_spend_down", "savings_capacity"],
  accounts: ["debt_vs_cash", "interest_bleed", "idle_cash", "utilization", "low_buffer"],
  holdings: ["concentration"],
  networth: ["positive_networth"],
  recurring: ["recurring_increase", "recurring_new"],
};

async function patchStatus(id: string, status: StoredInsight["status"]) {
  globalMutate(KEY, (cur: { insights: StoredInsight[] } | undefined) =>
    cur ? { insights: cur.insights.filter((i) => i.id !== id) } : cur, { revalidate: false });
  await fetch("/api/insights", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }).catch(() => {});
  globalMutate(KEY);
  // Also refresh the archive/home key variant.
  globalMutate("/api/insights");
}

function tintClass(ins: StoredInsight): string {
  if (ins.positive) return "border-emerald-500/30 bg-emerald-500/[0.06]";
  if (ins.severity >= 3) return "border-rose-500/30 bg-rose-500/[0.06]";
  if (ins.severity === 2) return "border-amber-500/30 bg-amber-500/[0.06]";
  return "border-hairline bg-surface";
}

export function InsightStrip({ page }: { page: keyof typeof PAGE_KINDS }) {
  const [open, setOpen] = useState(false);
  const { data } = useSWR<{ insights: StoredInsight[] }>(KEY, fetchJson, { revalidateOnFocus: false });
  const kinds = PAGE_KINDS[page] ?? [];
  const ins = (data?.insights ?? []).find((i) => kinds.includes(i.kind));
  if (!ins) return null;

  return (
    <div className={`rounded-2xl border p-4 ${tintClass(ins)}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-brand-400">{ins.positive ? <Sparkles size={16} /> : <Lightbulb size={16} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{ins.headline}</div>
          <div className="mt-0.5 text-sm text-ink-dim">{ins.body}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-brand-400 hover:underline">
              Why <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {ins.action && <a href={ins.action.deeplink} className="text-ink-dim hover:text-ink">{ins.action.label} →</a>}
          </div>
          {open && (
            <div className="mt-2 rounded-lg border border-hairline bg-surface-raised/60 p-2 text-[11px] text-ink-dim">
              {ins.evidence.map((e: EvidenceRef, i) => <div key={i} className={i ? "mt-1" : ""}>{e.note}</div>)}
            </div>
          )}
        </div>
        <button onClick={() => patchStatus(ins.id, "dismissed")} aria-label="Dismiss" className="shrink-0 text-ink-faint hover:text-ink"><X size={15} /></button>
      </div>
    </div>
  );
}
