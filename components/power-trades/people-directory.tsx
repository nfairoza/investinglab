"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, Users, ExternalLink } from "lucide-react";
import { PersonDetail } from "./person-detail";

interface Person {
  id: string; canonical_name: string; category: string; party: string | null; state: string | null;
  office: string | null; latest_disclosure_date: string | null;
  trade_count_30d: number; trade_count_90d: number; trade_count_1y: number; trade_count_all: number;
  in_current_feed?: boolean; empty_reason?: string | null; source_enabled?: boolean;
  covered_by_source?: string | null; is_known_seed?: boolean; oge_url?: string | null;
}
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

const CATS = ["all", "congress", "executive", "corporate_insider", "lobbyist", "donor", "celebrity", "other"];

export function PeopleDirectory() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const qs = new URLSearchParams({ q, category, limit: "150" }).toString();
  const { data, isLoading } = useSWR<{ rows: Person[] }>(`/api/power-trades/people?${qs}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
          <Search size={15} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a person (e.g. Pelosi)…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus:outline-none" style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
          {CATS.map((c) => <option key={c} value={c}>{c === "all" ? "All people" : c.replace("_", " ")}</option>)}
        </select>
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          <Users size={22} className="mx-auto text-ink-faint" />
          <p className="mt-2">
            {q.trim()
              ? <>No match for “{q}”. This directory covers Congress, executive-branch officials, corporate insiders (SEC Form 4), and major donors/lobbyists as influence context. A person may be missing if their source category isn&apos;t enabled, they have no public filing requirement, or the filing hasn&apos;t been parsed yet.</>
              : "No people loaded yet. An admin needs to run a sync to populate the directory."}
          </p>
        </div>
      )}

      {selected && <PersonDetail name={selected} onClose={() => setSelected(null)} />}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Person</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">30d</th>
                <th className="px-3 py-2 text-right">90d</th>
                <th className="px-3 py-2 text-right">1y</th>
                <th className="px-3 py-2 text-right">All</th>
                <th className="px-3 py-2">Latest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((p) => {
                const inFeed = p.in_current_feed ?? p.trade_count_all > 0;
                return (
                <tr key={p.id} className="align-top hover:bg-surface">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setSelected(selected === p.canonical_name ? null : p.canonical_name)} className="font-medium text-brand-300 hover:underline">{p.canonical_name}</button>
                      {inFeed
                        ? <span className="rounded-full border border-emerald-500/40 px-1.5 py-0.5 text-[9px] text-emerald-300">in feed</span>
                        : <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[9px] text-ink-faint">no records</span>}
                    </div>
                    {p.office && <span className="block text-[11px] text-ink-faint">{p.office}{p.state ? ` · ${p.state}` : ""}</span>}
                    {!inFeed && p.empty_reason && <span className="mt-0.5 block max-w-md text-[11px] text-ink-faint">{p.empty_reason}</span>}
                    {p.oge_url && (
                      <a href={p.oge_url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-400 hover:underline">
                        OGE disclosure <ExternalLink size={10} />
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-dim">{p.category.replace("_", " ")}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{p.trade_count_30d}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{p.trade_count_90d}</td>
                  <td className="px-3 py-2 text-right text-ink-dim">{p.trade_count_1y}</td>
                  <td className="px-3 py-2 text-right font-medium text-ink">{p.trade_count_all}</td>
                  <td className="px-3 py-2 text-[11px] text-ink-faint">{p.latest_disclosure_date ?? "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-ink-faint">Counts are parsed congressional disclosures (via FMP). A person with 0 in a window may still have older filings — try All, or Raw Disclosures.</p>
    </div>
  );
}
