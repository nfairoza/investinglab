"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Layers, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ErrorState } from "../data-state";

// PT5 — Clusters tab. Lists detected insider clusters (3+ distinct insiders
// buying the same issuer within 30d). Each row expands to the individual Form 4s.
interface Cluster {
  id: string; issuer: string; window_start: string; window_end: string;
  insider_count: number; insiders: string[]; total_value: number; trade_ids: string[]; detected_at: string;
}
interface ClusterTrade {
  id: string; person_name: string; person_role: string | null; transaction_date: string | null;
  disclosure_date: string | null; amount_label: string | null; source_url: string | null;
}

function money(v: number): string {
  return v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`;
}

function ExpandedTrades({ issuer }: { issuer: string }) {
  const { data } = useSWR<{ trades: ClusterTrade[] }>(`/api/power-trades/clusters?issuer=${encodeURIComponent(issuer)}`, fetchJson, { revalidateOnFocus: false });
  const trades = data?.trades ?? [];
  if (trades.length === 0) return <p className="px-3 py-2 text-xs text-ink-faint">Loading filings…</p>;
  return (
    <table className="w-full text-left text-xs">
      <tbody className="divide-y divide-white/5 text-ink-dim">
        {trades.map((t) => (
          <tr key={t.id}>
            <td className="px-3 py-1.5 text-ink">{t.person_name}{t.person_role ? <span className="text-ink-faint"> · {t.person_role}</span> : ""}</td>
            <td className="px-3 py-1.5">{t.amount_label ?? "—"}</td>
            <td className="px-3 py-1.5 text-ink-faint">{t.transaction_date ?? "—"}</td>
            <td className="px-3 py-1.5">{t.source_url ? <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:underline">Form 4 <ExternalLink size={10} /></a> : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ClustersTab() {
  const { data, error, isLoading, mutate } = useSWR<{ rows: Cluster[] }>(`/api/power-trades/clusters`, fetchJson, { revalidateOnFocus: false });
  const [open, setOpen] = useState<string | null>(null);
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-hairline bg-surface p-3 text-xs text-ink-dim">
        <span className="font-semibold text-ink">Why clusters matter.</span> When three or more
        <em> independent</em> insiders buy the same company on the open market within a month, it&apos;s
        the strongest-studied insider signal — harder to explain away than any single trade. Still one
        input, not a recommendation: option exercises and planned (10b5-1) sales are excluded.
      </div>

      {error && !data && <ErrorState error={error} onRetry={() => mutate()} />}
      {!error && !isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          <Layers size={22} className="mx-auto text-ink-faint" />
          <p className="mt-2">No active insider clusters. They appear when 3+ insiders buy the same stock within 30 days (needs SEC Form 4 sync enabled).</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-hairline">
              <button onClick={() => setOpen(open === c.issuer ? null : c.issuer)} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-surface">
                <div className="flex items-center gap-2">
                  {open === c.issuer ? <ChevronDown size={15} className="text-ink-faint" /> : <ChevronRight size={15} className="text-ink-faint" />}
                  <Link href={`/research?symbol=${c.issuer}`} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold text-brand-300 hover:underline">{c.issuer}</Link>
                  <span className="text-sm text-ink">{c.insider_count} insiders bought — {money(c.total_value)} combined</span>
                </div>
                <span className="text-[11px] text-ink-faint">{c.window_start} → {c.window_end}</span>
              </button>
              {open === c.issuer && <div className="border-t border-hairline"><ExpandedTrades issuer={c.issuer} /></div>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-ink-faint">Source: SEC Form 4 open-market purchases (code P). Rebuilt nightly.</p>
    </div>
  );
}
