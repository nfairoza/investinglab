"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search, ExternalLink, FileText } from "lucide-react";

interface Trade {
  id: string; source: string; source_url: string | null; person_name: string; person_role: string | null;
  relationship: string | null; ticker: string | null; asset_name: string | null; transaction_type: string | null;
  transaction_date: string | null; disclosure_date: string | null; amount_label: string | null; chamber_or_branch: string | null;
}
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

const TYPE_CLS: Record<string, string> = {
  buy: "border-emerald-500/40 text-emerald-300", sell: "border-rose-500/40 text-rose-300",
  exchange: "border-sky-500/40 text-sky-300", option: "border-violet-500/40 text-violet-300",
};

export function RawDisclosures() {
  const [q, setQ] = useState("");
  const [windowKey, setWindowKey] = useState("90d");
  const qs = new URLSearchParams({ q, window: windowKey, limit: "300" }).toString();
  const { data, isLoading } = useSWR<{ rows: Trade[] }>(`/api/power-trades/trades?${qs}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
          <Search size={15} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by person, ticker, or asset…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          {["30d", "90d", "1y", "all"].map((w) => (
            <button key={w} onClick={() => setWindowKey(w)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${w === windowKey ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"}`}>
              {w}
            </button>
          ))}
        </div>
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          <FileText size={22} className="mx-auto text-ink-faint" />
          <p className="mt-2">No disclosures for this window. Try <span className="text-ink">All-time</span>. If still empty, the source (FMP) hasn&apos;t been synced yet, or doesn&apos;t cover this filter.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Traded</th>
                <th className="px-3 py-2">Disclosed</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-surface">
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink">{t.person_name}</span>
                    <span className="block text-[11px] text-ink-faint">
                      {t.chamber_or_branch ?? ""}{t.relationship && t.relationship !== "self" ? ` · ${t.relationship}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {t.ticker ? <Link href={`/research?symbol=${t.ticker}`} className="font-mono text-brand-300 hover:underline">{t.ticker}</Link> : <span className="text-ink-faint">{t.asset_name ?? "—"}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${TYPE_CLS[t.transaction_type ?? ""] ?? "border-hairline text-ink-dim"}`}>{t.transaction_type ?? "unknown"}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-dim">{t.amount_label ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{t.transaction_date ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{t.disclosure_date ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {t.source_url
                      ? <a href={t.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-400 hover:underline">Filing <ExternalLink size={11} /></a>
                      : <span className="text-ink-faint">PTR via FMP</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-ink-faint">Source: congressional PTRs via FMP (Senate eFD + House Clerk). Delayed up to 45 days, often range-based.</p>
    </div>
  );
}
