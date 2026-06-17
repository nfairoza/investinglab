"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DataBadge, DataTimestamp } from "@/components/data-state";
import type { DataResult, PriceHistory } from "@/lib/providers/types";

async function getHistory(url: string): Promise<DataResult<PriceHistory>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<PriceHistory>;
}

const RANGES = [
  { key: "1M", days: 22 },
  { key: "3M", days: 66 },
  { key: "6M", days: 132 },
  { key: "1Y", days: 252 },
  { key: "5Y", days: 100000 },
] as const;

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<string>("3M");
  const { data, isLoading } = useSWR<DataResult<PriceHistory>>(
    `/api/price-history?symbol=${symbol}`,
    getHistory,
    { keepPreviousData: true },
  );

  const allPoints = data?.data?.points ?? [];
  const days = RANGES.find((r) => r.key === range)?.days ?? 66;
  const points = allPoints.slice(-days);

  // Up over the visible window? color the area green, else red.
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  const up = last >= first;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const stroke = up ? "#10b981" : "#f87171";

  const chartable = points.length > 1;

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">{symbol} — Price history</div>
          {chartable && (
            <div className="text-xs mt-0.5">
              <span className="text-slate-400">${last.toFixed(2)}</span>{" "}
              <span className={up ? "text-emerald-400" : "text-rose-400"}>
                {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}% over {range}
              </span>
            </div>
          )}
        </div>
        {data && <DataBadge source={data.source} />}
      </div>

      {/* Range buttons */}
      <div className="mt-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              range === r.key
                ? "bg-brand-500/15 text-brand-300"
                : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
            }`}
          >
            {r.key}
          </button>
        ))}
      </div>

      {isLoading && <div className="mt-4 h-56 animate-pulse rounded bg-slate-800" />}

      {!isLoading && !chartable && (
        <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-white/10 text-sm text-slate-500">
          <div className="text-center">
            <DataBadge source="unavailable" />
            <p className="mt-2">{data?.note ?? "Price history unavailable."}</p>
          </div>
        </div>
      )}

      {chartable && (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                minTickGap={40} tickFormatter={(v) => (range === "5Y" || range === "1Y" ? v.slice(0, 7) : v.slice(5))} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
                domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} width={52} />
              <Tooltip
                contentStyle={{ background: "rgba(12,16,13,0.95)", border: "1px solid rgba(212,168,42,0.25)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]}
              />
              <Area dataKey="close" stroke={stroke} strokeWidth={1.5} fill={`url(#grad-${symbol})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
      <p className="mt-1 text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
