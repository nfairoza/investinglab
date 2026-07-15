"use client";

import useSWR from "swr";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { DataBadge, DataTimestamp } from "@/components/data-state";
import type { DataResult, Financials } from "@/lib/providers/types";

async function getFinancials(url: string): Promise<DataResult<Financials>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<Financials>;
}

function fmtM(n: number | null) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return `${n.toFixed(0)}`;
}

export function RevenueEarningsChart({ symbol, financials }: { symbol: string; financials?: DataResult<Financials> | null }) {
  const { data: fetched, isLoading } = useSWR<DataResult<Financials>>(
    financials === undefined ? `/api/financials?symbol=${symbol}` : null,
    getFinancials,
    { keepPreviousData: true },
  );

  const data = financials !== undefined ? financials : fetched;
  const quarters = data?.data?.quarters ?? [];

  // Only rows with an actual value are plottable. FMP can return quarter periods
  // with null revenue/income on some plans — those must NOT render as empty bars.
  const rows = quarters
    .filter((q) => q.revenue != null || q.netIncome != null)
    .map((q) => ({ period: q.period, Revenue: q.revenue, "Net income": q.netIncome }));

  // Nothing at all (e.g. ETFs/funds) — hide the card entirely.
  if (!isLoading && quarters.length === 0) return null;
  // Loaded, but no plottable values (plan-tiered / partial data) — show an honest
  // notice instead of a blank chart.
  const loadedButEmpty = Boolean(data) && !isLoading && rows.length === 0;

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{symbol} — Revenue & net income</div>
          <div className="text-xs text-ink-faint mt-0.5">Is the business actually growing?</div>
        </div>
        {data && rows.length > 0 && <DataBadge source={data.source} />}
      </div>

      {isLoading && !data && <div className="mt-4 h-48 animate-pulse rounded bg-surface-raised" />}

      {loadedButEmpty && (
        <p className="mt-4 rounded-lg border border-hairline bg-surface px-3 py-6 text-center text-xs text-ink-faint">
          Quarterly financials aren&apos;t available for {symbol} on the current data plan.
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 aspect-[2/1] max-h-64 w-full">
          <div data-no-page-swipe><ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="period" tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false}
                tickFormatter={(v) => fmtM(v)} width={52} />
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-gold)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-dim)" }}
                formatter={(v: number) => [fmtM(v)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-dim)" }} />
              <Bar dataKey="Revenue" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Net income" fill="var(--positive)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </div>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
      <p className="mt-1 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
