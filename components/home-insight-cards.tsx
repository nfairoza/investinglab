"use client";

import useSWR from "swr";
import Link from "next/link";
import { Lightbulb, Sparkles, ChevronRight } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { INSIGHTS_ALL_USERS } from "@/lib/insights/config";
import type { StoredInsight } from "@/lib/insights/types";

// Home cross-domain triage surface: the top 1–2 active insights by
// (severity, impact/yr), any domain. This is the ONLY surface that ranks across
// domains. Renders nothing when there's nothing worth showing (never a
// placeholder). Tappable → the Insights archive.
export function HomeInsightCards({ isAdmin = false }: { isAdmin?: boolean }) {
  const gated = INSIGHTS_ALL_USERS || isAdmin;
  const { data } = useSWR<{ insights: StoredInsight[] }>(gated ? "/api/insights?active=1" : null, fetchJson, { revalidateOnFocus: false });
  if (!gated) return null;
  const top = (data?.insights ?? []).slice(0, 2);
  if (top.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {top.map((ins) => {
        const tone = ins.positive
          ? "from-emerald-500/[0.10]"
          : ins.severity >= 3 ? "from-rose-500/[0.10]" : ins.severity === 2 ? "from-amber-500/[0.10]" : "from-brand-500/[0.08]";
        return (
          <Link key={ins.id} href="/insights"
            className={`card-hover group block rounded-2xl glass bg-gradient-to-br ${tone} to-transparent p-5 transition-transform active:scale-[0.99]`}>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                {ins.positive ? <Sparkles size={15} className="text-emerald-400" /> : <Lightbulb size={15} className="text-brand-400" />}
                {ins.headline}
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
            </div>
            <div className="mt-2 text-sm text-ink-dim">{ins.body}</div>
          </Link>
        );
      })}
    </div>
  );
}
