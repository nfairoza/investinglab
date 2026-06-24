"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, ExternalLink, Coins } from "lucide-react";

// Influence Context — campaign finance (FEC) + lobbying (OpenSecrets).
// CRITICAL: this is NOT trades. No buy/sell styling, no Alpha score, no "trade"
// language. Money/influence context only, each row with a source link + label.
interface InfluenceRecord {
  id: string; source: string; record_type: string; source_url: string;
  subject_name: string; counterparty_name: string | null;
  city: string | null; state: string | null; employer: string | null; occupation: string | null;
  amount: number | null; amount_label: string | null; cycle_or_year: string | null;
  issue_or_industry: string | null; attribution: string | null;
}
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

const TYPE_LABEL: Record<string, string> = {
  campaign_contribution: "Contribution", committee_summary: "Committee", lobbying: "Lobbying",
  pac: "PAC", revolving_door: "Revolving door",
};
const SOURCE_LABEL: Record<string, string> = { fec: "Source: FEC", opensecrets: "Source: OpenSecrets" };

export function InfluenceContext() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const qs = new URLSearchParams({ q, source, limit: "300" }).toString();
  const { data, isLoading } = useSWR<{ rows: InfluenceRecord[] }>(`/api/power-trades/influence?${qs}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Required banner — explicitly NOT trades. */}
      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-[13px] text-sky-200">
        Influence Context shows campaign finance (FEC) and lobbying (OpenSecrets) data — money and
        influence, <span className="font-semibold">NOT stock trades</span>. Figures are reported to
        public agencies and may lag. Individual donor addresses are intentionally excluded.
        Source: FEC, OpenSecrets (CC BY-NC-SA).
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
          <Search size={15} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by official, org, or industry…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          {["all", "fec", "opensecrets"].map((s) => (
            <button key={s} onClick={() => setSource(s)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${s === source ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"}`}>
              {s === "all" ? "All" : s === "fec" ? "FEC" : "OpenSecrets"}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          <Coins size={22} className="mx-auto text-ink-faint" />
          <p className="mt-2">No verified influence records yet. An admin needs to run an FEC / OpenSecrets sync, or the enabled sources don&apos;t cover this filter. No records → nothing shown (never fabricated).</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Official</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">From / about</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Cycle</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-3 py-2 font-medium text-ink">{r.subject_name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[10px] text-ink-dim">{TYPE_LABEL[r.record_type] ?? r.record_type}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-dim">
                    {r.counterparty_name ?? r.issue_or_industry ?? "—"}
                    {r.state && <span className="ml-1 text-[11px] text-ink-faint">· {r.state}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-dim">{r.amount_label ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{r.cycle_or_year ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:underline" title={r.attribution ?? SOURCE_LABEL[r.source]}>
                      {r.source === "fec" ? "FEC" : "OpenSecrets"} <ExternalLink size={11} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-ink-faint">
        Influence context, not trades and not a recommendation or accusation — disclosed public
        money-in-politics data. FEC contributor lists may not be used commercially; OpenSecrets data
        is CC BY-NC-SA (attribution, non-commercial). Source: FEC, OpenSecrets.
      </p>
    </div>
  );
}
