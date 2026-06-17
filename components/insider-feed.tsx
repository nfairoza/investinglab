"use client";

import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, InsiderTrade } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<InsiderTrade[]>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<InsiderTrade[]>;
}

const TYPE_STYLE: Record<string, string> = {
  "P-Purchase": "border-emerald-500/40 text-emerald-300",
  "S-Sale": "border-rose-500/40 text-rose-300",
};

function typeLabel(t: string): string {
  if (t.startsWith("P-")) return "Bought";
  if (t.startsWith("S-")) return "Sold";
  return t;
}

function typeStyle(t: string): string {
  return TYPE_STYLE[t] ?? "border-slate-600 text-slate-400";
}

export function InsiderFeed({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<InsiderTrade[]>>(
    `/api/insider?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const trades = data?.data ?? [];

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{symbol} — Insider transactions</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Corporate officers and directors buying or selling their own company's stock. Insiders sell for many reasons; buying is often more meaningful.
      </p>

      {isLoading && <div className="mt-4 h-20 animate-pulse rounded bg-slate-800" />}

      {!isLoading && !data?.data && (
        <p className="mt-3 text-sm text-slate-500">{data?.note ?? "Insider data unavailable."}</p>
      )}

      {trades.length > 0 && (
        <div className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-black/40 backdrop-blur text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Insider</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Shares</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trades.slice(0, 60).map((t, i) => (
                <tr key={i} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2 text-slate-200">{t.reportingName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-md border px-2 py-0.5 text-xs ${typeStyle(t.transactionType)}`}>
                      {typeLabel(t.transactionType)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {t.securitiesTransacted != null ? t.securitiesTransacted.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    {t.price != null ? `$${t.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{t.date}</td>
                  <td className="px-3 py-2">
                    {t.secLink && (
                      <a href={t.secLink} target="_blank" rel="noreferrer" className="text-xs text-brand-400 underline">
                        SEC
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trades.length === 0 && !isLoading && data?.data && (
        <p className="mt-3 text-sm text-slate-500">No recent insider transactions found.</p>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
    </div>
  );
}
