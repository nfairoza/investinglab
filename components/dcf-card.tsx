"use client";

import useSWR from "swr";
import { DataBadge } from "./data-state";
import type { DataResult, DcfValue } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<DcfValue>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<DcfValue>;
}

export function DcfCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<DcfValue>>(
    `/api/dcf?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const d = data?.data;
  const pct = d?.upDownPct;
  // positive = stock trades above DCF (expensive vs model), negative = below (cheap vs model)
  const cheap = pct != null && pct < 0;
  const expensive = pct != null && pct > 0;

  return (
    <div className="card-hover rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">{symbol} — DCF fair value</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        FMP's discounted cash flow model. One estimate — not a guarantee. Always use a range.
      </p>

      {isLoading && <div className="mt-4 h-16 animate-pulse rounded bg-slate-800" />}
      {!isLoading && !d && (
        <p className="mt-3 text-sm text-slate-500">{data?.note ?? "DCF data unavailable."}</p>
      )}

      {d && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs text-slate-500">DCF intrinsic value</div>
              <div className="text-2xl font-bold text-slate-100">
                {d.dcf != null ? `$${d.dcf.toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Current price</div>
              <div className="text-xl font-semibold text-slate-300">
                {d.price != null ? `$${d.price.toFixed(2)}` : "—"}
              </div>
            </div>
            {pct != null && (
              <div>
                <div className="text-xs text-slate-500">vs fair value</div>
                <div className={`text-xl font-semibold ${cheap ? "text-emerald-400" : expensive ? "text-rose-400" : "text-slate-300"}`}>
                  {cheap ? "▼ " : "▲ "}{Math.abs(pct).toFixed(1)}%{" "}
                  <span className="text-sm font-normal">{cheap ? "below (potentially undervalued)" : "above (potentially overvalued)"}</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80">
            A DCF is only as good as its assumptions. Use this as one data point alongside valuation multiples, growth rate, and the AI memo — never in isolation.
          </div>
        </div>
      )}
    </div>
  );
}
