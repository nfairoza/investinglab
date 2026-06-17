"use client";

import { useState } from "react";
import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { CongressTrade, DataResult } from "@/lib/providers/types";

async function getTrades(url: string): Promise<DataResult<CongressTrade[]>> {
  try {
    const r = await fetch(url);
    return (await r.json()) as DataResult<CongressTrade[]>;
  } catch {
    return { data: null, source: "unavailable", asOf: null, provider: "client", note: "request failed" };
  }
}

// Buy/sell carried by WORD + color (never color alone).
function TypeTag({ type }: { type: CongressTrade["type"] }) {
  const map = {
    buy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    sell: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    exchange: "border-slate-600 bg-slate-700/30 text-slate-300",
  } as const;
  const label = type === "buy" ? "Bought" : type === "sell" ? "Sold" : "Exchanged";
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${map[type]}`}>{label}</span>;
}

export function CongressFeed() {
  const { data, isLoading, isValidating, mutate } = useSWR<DataResult<CongressTrade[]>>(
    "/api/congress?limit=50",
    getTrades,
    { revalidateOnFocus: true, keepPreviousData: true },
  );
  const [q, setQ] = useState("");

  const trades = data?.data ?? [];
  const filtered = q.trim()
    ? trades.filter((t) => {
        const needle = q.toLowerCase();
        return (
          t.member.toLowerCase().includes(needle) ||
          (t.symbol ?? "").toLowerCase().includes(needle) ||
          t.asset.toLowerCase().includes(needle)
        );
      })
    : trades;

  return (
    <div className="space-y-4">
      {/* Honesty banner — the two caveats that matter for this data. */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
        This is <span className="font-medium">lagged disclosure, not live positions</span>:
        members report trades up to 45 days after the fact, and amounts are{" "}
        <span className="font-medium">ranges, not exact figures</span>. A disclosed trade is not a
        buy/sell signal.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by member, ticker, or asset…"
          className="w-72 rounded-md border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          {data && <DataBadge source={data.source} />}
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            {isValidating ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-lg bg-slate-800" />}

      {!isLoading && !data?.data && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
          Live data unavailable{data?.note ? ` — ${data.note}` : ""}. Add a congress-trades API key
          to switch from demo to live filings.
        </div>
      )}

      {!isLoading && data?.data && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/25 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Amount (range)</th>
                <th className="px-3 py-2">Traded</th>
                <th className="px-3 py-2">Disclosed</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2">
                    <div className="text-slate-200">{t.member}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.chamber}
                      {t.party ? ` · ${t.party}` : ""}
                      {t.state ? `-${t.state}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2"><TypeTag type={t.type} /></td>
                  <td className="px-3 py-2 font-medium text-slate-200">{t.symbol ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-300">{t.amountRange}</td>
                  <td className="px-3 py-2 text-slate-400">{t.txDate}</td>
                  <td className="px-3 py-2 text-slate-400">{t.disclosureDate}</td>
                  <td className="px-3 py-2">
                    {t.sourceLink ? (
                      <a href={t.sourceLink} target="_blank" rel="noreferrer" className="text-xs text-brand-400 underline">
                        {t.chamber === "Senate" ? "Senate eFD" : "House PTR"}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No matching disclosures.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <DataTimestamp asOf={data.asOf} />}
    </div>
  );
}
