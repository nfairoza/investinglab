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

  const rows = quarters.map((q) => ({
    period: q.period,
    Revenue: q.revenue,
    "Net income": q.netIncome,
  }));

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">{symbol} — Revenue & net income</div>
          <div className="text-xs text-slate-500 mt-0.5">Is the business actually growing?</div>
        </div>
        {data && <DataBadge source={data.source} />}
      </div>

      {isLoading && !data && <div className="mt-4 h-48 animate-pulse rounded bg-slate-800" />}

      {!isLoading && !rows.length && (
        <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-white/10 text-sm text-slate-500">
          <div className="text-center">
            <DataBadge source="unavailable" />
            <p className="mt-2">Financial data unavailable.</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                tickFormatter={(v) => fmtM(v)} width={52} />
              <Tooltip
                contentStyle={{ background: "rgba(12,16,13,0.95)", border: "1px solid rgba(212,168,42,0.25)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [fmtM(v)]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Bar dataKey="Revenue" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Net income" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
      <p className="mt-1 text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
