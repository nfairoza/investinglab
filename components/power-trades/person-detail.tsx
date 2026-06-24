"use client";

import useSWR from "swr";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";

// Inline detail panel for a person in the directory. Reads the SAME local APIs
// (trades + influence) filtered by name — no navigation, no page reload.
interface Trade {
  id: string; source: string; source_url: string | null; ticker: string | null; asset_name: string | null;
  transaction_type: string | null; transaction_date: string | null; disclosure_date: string | null;
  amount_label: string | null; chamber_or_branch: string | null;
}
interface Influence {
  id: string; source: string; record_type: string; source_url: string;
  counterparty_name: string | null; issue_or_industry: string | null; amount_label: string | null; cycle_or_year: string | null; state: string | null;
}
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

const TYPE_CLS: Record<string, string> = {
  buy: "border-emerald-500/40 text-emerald-300", sell: "border-rose-500/40 text-rose-300",
  exchange: "border-sky-500/40 text-sky-300", option: "border-violet-500/40 text-violet-300",
};

export function PersonDetail({ name, onClose }: { name: string; onClose: () => void }) {
  const enc = encodeURIComponent(name);
  const { data: tradesData, isLoading: tLoading } = useSWR<{ rows: Trade[] }>(`/api/power-trades/trades?person=${enc}&window=all&limit=100`, fetchJson, { revalidateOnFocus: false });
  const { data: infData } = useSWR<{ rows: Influence[] }>(`/api/power-trades/influence?q=${enc}&limit=100`, fetchJson, { revalidateOnFocus: false });
  const trades = tradesData?.rows ?? [];
  const influence = infData?.rows ?? [];

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">{name}</div>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-faint hover:bg-surface hover:text-ink"><X size={15} /></button>
      </div>

      {/* Trades */}
      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Trades ({trades.length})</div>
        {tLoading && <p className="mt-1 text-xs text-ink-faint">Loading…</p>}
        {!tLoading && trades.length === 0 && <p className="mt-1 text-xs text-ink-faint">No parsed trades on file in the enabled sources.</p>}
        {trades.length > 0 && (
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint"><tr><th className="py-1 pr-3">Ticker</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Amount</th><th className="py-1 pr-3">Traded</th><th className="py-1 pr-3">Disclosed</th><th className="py-1">Source</th></tr></thead>
              <tbody className="divide-y divide-white/5 text-ink-dim">
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1 pr-3">{t.ticker ? <Link href={`/research?symbol=${t.ticker}`} className="font-mono text-brand-300 hover:underline">{t.ticker}</Link> : <span className="text-ink-faint">{t.asset_name ?? "—"}</span>}</td>
                    <td className="py-1 pr-3"><span className={`rounded border px-1 py-0.5 text-[10px] ${TYPE_CLS[t.transaction_type ?? ""] ?? "border-hairline text-ink-dim"}`}>{t.transaction_type ?? "—"}</span></td>
                    <td className="py-1 pr-3">{t.amount_label ?? "—"}</td>
                    <td className="py-1 pr-3 text-ink-faint">{t.transaction_date ?? "—"}</td>
                    <td className="py-1 pr-3 text-ink-faint">{t.disclosure_date ?? "—"}</td>
                    <td className="py-1">{t.source_url ? <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:underline">{t.source === "sec_form_4" ? "Form 4" : "Filing"} <ExternalLink size={10} /></a> : <span className="text-ink-faint">{t.source}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Influence context */}
      {influence.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Influence context — not trades ({influence.length})</div>
          <div className="mt-1.5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-faint"><tr><th className="py-1 pr-3">From / about</th><th className="py-1 pr-3">Amount</th><th className="py-1 pr-3">Cycle</th><th className="py-1">Source</th></tr></thead>
              <tbody className="divide-y divide-white/5 text-ink-dim">
                {influence.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3">{r.counterparty_name ?? r.issue_or_industry ?? "—"}{r.state ? ` · ${r.state}` : ""}</td>
                    <td className="py-1 pr-3">{r.amount_label ?? "—"}</td>
                    <td className="py-1 pr-3 text-ink-faint">{r.cycle_or_year ?? "—"}</td>
                    <td className="py-1">{r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:underline">{r.source === "fec" ? "FEC" : r.source} <ExternalLink size={10} /></a> : <span className="text-ink-faint">{r.source}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
