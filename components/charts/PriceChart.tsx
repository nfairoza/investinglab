"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot,
} from "recharts";
import { DataBadge, DataTimestamp } from "@/components/data-state";
import type { DataResult, PriceHistory } from "@/lib/providers/types";
import { useChartTheme, tooltipStyle } from "./chart-theme";

async function getHistory(url: string): Promise<DataResult<PriceHistory>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<PriceHistory>;
}

const RANGES = [
  { key: "1D", days: 1 },
  { key: "1M", days: 22 },
  { key: "3M", days: 66 },
  { key: "6M", days: 132 },
  { key: "1Y", days: 252 },
  { key: "5Y", days: 100000 },
] as const;

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<string>("3M");
  const ct = useChartTheme();
  const isIntraday = range === "1D";
  // Daily history (all non-1D ranges share one fetch). Intraday is a separate
  // endpoint hit only when 1D is selected.
  const { data, isLoading } = useSWR<DataResult<PriceHistory>>(
    `/api/price-history?symbol=${symbol}`,
    getHistory,
    { keepPreviousData: true },
  );
  const { data: intraday, isLoading: intradayLoading } = useSWR<DataResult<PriceHistory>>(
    isIntraday ? `/api/price-history?symbol=${symbol}&range=1D` : null,
    getHistory,
    { keepPreviousData: true, refreshInterval: 60_000 },
  );

  const active = isIntraday ? intraday : data;
  const loading = isIntraday ? intradayLoading : isLoading;
  const allPoints = active?.data?.points ?? [];
  const days = RANGES.find((r) => r.key === range)?.days ?? 66;
  const points = isIntraday ? allPoints : allPoints.slice(-days);

  // Up over the visible window? color the area green, else red.
  const first = points[0]?.close ?? 0;
  const last = points[points.length - 1]?.close ?? 0;
  const up = last >= first;
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
  const stroke = up ? ct.positive : ct.negative;

  const chartable = points.length > 1;

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">{symbol} — Price history</div>
          {chartable && (
            <div className="text-xs mt-0.5">
              <span className="text-ink-dim">${last.toFixed(2)}</span>{" "}
              <span className={up ? "text-emerald-400" : "text-rose-400"}>
                {up ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}% {isIntraday ? "today" : `over ${range}`}
              </span>
            </div>
          )}
        </div>
        {active && <DataBadge source={active.source} />}
      </div>

      {/* Range buttons */}
      <div className="mt-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              range === r.key
                ? "tab-active"
                : "text-ink-faint hover:bg-surface-raised hover:text-ink-dim"
            }`}
          >
            {r.key}
          </button>
        ))}
      </div>

      {loading && <div className="mt-4 h-56 animate-pulse rounded bg-surface-raised" />}

      {!loading && !chartable && (
        <div className="mt-4 flex h-56 items-center justify-center rounded-lg border border-hairline text-sm text-ink-faint">
          <div className="text-center">
            <DataBadge source="unavailable" />
            <p className="mt-2">{active?.note ?? "Price history unavailable."}</p>
          </div>
        </div>
      )}

      {chartable && (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
                <filter id={`grad-${symbol}-blur`} x="-20%" y="-40%" width="140%" height="180%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: ct.axis, fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false}
                minTickGap={40} tickFormatter={(v) => (isIntraday ? v : range === "5Y" || range === "1Y" ? v.slice(0, 7) : v.slice(5))} />
              <YAxis tick={{ fill: ct.axis, fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false}
                domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} width={52} />
              <Tooltip
                contentStyle={tooltipStyle(ct)}
                labelStyle={{ color: ct.axis }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Close"]}
              />
              {/* soft glow underlay (matches the dashboard Top-Assets sparkline).
                  tooltipType="none" keeps it out of the tooltip so "Close" isn't doubled. */}
              <Area dataKey="close" tooltipType="none" stroke={stroke} strokeOpacity={0.35} strokeWidth={5} fill="none"
                filter={`url(#grad-${symbol}-blur)`} isAnimationActive={false} dot={false} activeDot={false} legendType="none" />
              {/* crisp line + gradient fill, glowing last point */}
              <Area dataKey="close" stroke={stroke} strokeWidth={2} fill={`url(#grad-${symbol})`}
                dot={(p: any) => (p.index === points.length - 1
                  ? <Dot key="last" cx={p.cx} cy={p.cy} r={3.5} fill={stroke} stroke="var(--bg)" strokeWidth={2} />
                  : (null as any))}
                activeDot={{ r: 4, fill: stroke, stroke: "var(--bg)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {active && <div className="mt-2"><DataTimestamp asOf={active.asOf} /></div>}
      <p className="mt-1 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
