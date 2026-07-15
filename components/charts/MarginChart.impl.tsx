"use client";

import useSWR from "swr";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { DataBadge, DataTimestamp } from "@/components/data-state";
import type { DataResult, Financials } from "@/lib/providers/types";

async function getFinancials(url: string): Promise<DataResult<Financials>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<Financials>;
}

export function MarginChart({ symbol, financials }: { symbol: string; financials?: DataResult<Financials> | null }) {
  const { data: fetched, isLoading } = useSWR<DataResult<Financials>>(
    financials === undefined ? `/api/financials?symbol=${symbol}` : null,
    getFinancials,
    { keepPreviousData: true },
  );

  const data = financials !== undefined ? financials : fetched;
  const quarters = data?.data?.quarters ?? [];

  const rows = quarters
    .filter((q) => q.grossMarginPct != null || q.operatingMarginPct != null)
    .map((q) => ({
      period: q.period,
      "Gross margin %": q.grossMarginPct != null ? +q.grossMarginPct.toFixed(1) : null,
      "Operating margin %": q.operatingMarginPct != null ? +q.operatingMarginPct.toFixed(1) : null,
    }));

  // Nothing at all (e.g. ETFs/funds) — hide the card entirely.
  if (!isLoading && quarters.length === 0) return null;
  // Loaded, but no plottable margins (plan-tiered / partial) — honest notice.
  const loadedButEmpty = Boolean(data) && !isLoading && rows.length === 0;

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{symbol} — Margins trend</div>
          <div className="text-xs text-ink-faint mt-0.5">Keeping more of each dollar over time?</div>
        </div>
        {data && rows.length > 0 && <DataBadge source={data.source} />}
      </div>

      {isLoading && !data && <div className="mt-4 h-48 animate-pulse rounded bg-surface-raised" />}

      {loadedButEmpty && (
        <p className="mt-4 rounded-lg border border-hairline bg-surface px-3 py-6 text-center text-xs text-ink-faint">
          Margin history isn&apos;t available for {symbol} on the current data plan.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 aspect-[2/1] max-h-64 w-full">
          <div data-no-page-swipe><ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="period" tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false}
                tickFormatter={(v) => `${v}%`} width={44} />
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-gold)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-dim)" }}
                formatter={(v: number) => [`${v}%`]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-dim)" }} />
              <Line dataKey="Gross margin %" stroke="var(--positive)" dot={false} strokeWidth={1.5} connectNulls />
              <Line dataKey="Operating margin %" stroke="var(--accent)" dot={false} strokeWidth={1.5} connectNulls />
            </LineChart>
          </ResponsiveContainer></div>
        </div>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
      <p className="mt-1 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
