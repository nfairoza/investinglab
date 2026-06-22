"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useChartTheme } from "./chart-theme";
import type { DataResult, PriceHistory } from "@/lib/providers/types";

interface Pt { v: number; date?: string }

const RANGES = [
  { k: "1M", d: 22 },
  { k: "3M", d: 66 },
  { k: "6M", d: 132 },
  { k: "1Y", d: 252 },
  { k: "ALL", d: 100000 },
] as const;

async function getHistory(url: string): Promise<DataResult<PriceHistory>> {
  return fetch(url).then((r) => r.json());
}

// Portfolio return % vs SPY return % over a window, both normalized to 0% at the
// start so they're directly comparable ("am I beating the market?"). The
// portfolio series is reconstructed upstream (sum of close×shares); we fetch SPY
// here and align by index.
export function PerformanceChart({ series }: { series: Pt[] }) {
  const ct = useChartTheme();
  const [range, setRange] = useState<string>("3M");
  const days = RANGES.find((r) => r.k === range)?.d ?? 66;

  const { data: spyRes } = useSWR<DataResult<PriceHistory>>(
    "/api/price-history?symbol=SPY",
    getHistory,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
  const spyPts = spyRes?.data?.points ?? [];

  // Window the portfolio series; align SPY to the same number of points.
  const pWin = series.slice(-days);
  const sWin = spyPts.slice(-pWin.length);
  const chartable = pWin.length > 1;

  const base0 = pWin[0]?.v || 0;
  const spy0 = sWin[0]?.close || 0;
  const rows = pWin.map((p, i) => ({
    date: p.date ?? "",
    port: base0 > 0 ? ((p.v - base0) / base0) * 100 : 0,
    spy: spy0 > 0 && sWin[i] ? ((sWin[i].close - spy0) / spy0) * 100 : null,
  }));

  const lastPort = rows.length ? rows[rows.length - 1].port : 0;
  const lastSpy = rows.length ? (rows[rows.length - 1].spy ?? 0) : 0;
  const beating = lastPort >= lastSpy;
  const stroke = lastPort >= 0 ? ct.positive : ct.negative;

  return (
    <div className="rounded-xl glass p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink">Performance vs S&amp;P 500</div>
          {chartable && (
            <div className="mt-0.5 flex items-center gap-3 text-xs">
              <span className={lastPort >= 0 ? "text-emerald-400" : "text-rose-400"}>
                You {lastPort >= 0 ? "▲" : "▼"} {Math.abs(lastPort).toFixed(1)}%
              </span>
              <span className="text-ink-faint">SPY {lastSpy >= 0 ? "▲" : "▼"} {Math.abs(lastSpy).toFixed(1)}%</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${beating ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-500"}`}>
                {beating ? "Beating the market" : "Trailing the market"}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-0.5">
          {RANGES.map((r) => (
            <button key={r.k} onClick={() => setRange(r.k)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${range === r.k ? "tab-active" : "text-ink-faint hover:text-ink-dim"}`}>
              {r.k}
            </button>
          ))}
        </div>
      </div>

      {!chartable ? (
        <div className="mt-4 flex h-56 items-center justify-center text-sm text-ink-faint">
          Add holdings with price history to see performance.
        </div>
      ) : (
        <div className="mt-3">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: ct.axis, fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false}
                minTickGap={40} tickFormatter={(v) => (range === "1Y" || range === "ALL" ? String(v).slice(0, 7) : String(v).slice(5))} />
              <YAxis tick={{ fill: ct.axis, fontSize: 10, fontFamily: "var(--font-mono)" }} tickLine={false}
                width={44} tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} domain={["auto", "auto"]} />
              <ReferenceLine y={0} stroke={ct.axis} strokeDasharray="2 4" />
              <Tooltip
                contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.hairline}`, borderRadius: 10, fontSize: 12, color: ct.text }}
                labelStyle={{ color: ct.axis }}
                formatter={(val: number, name: string) => [`${val >= 0 ? "+" : ""}${val.toFixed(2)}%`, name === "port" ? "You" : "SPY"]}
              />
              {/* portfolio = filled area; SPY = thin comparison line */}
              <Area dataKey="port" name="port" stroke={stroke} strokeWidth={2} fill="url(#perf-fill)" isAnimationActive={false} />
              <Line dataKey="spy" name="spy" stroke={ct.neutral} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-ink-faint">
            Both normalized to 0% at the window start. Portfolio value reconstructed from current holdings × historical prices (doesn&apos;t account for past buys/sells). Not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
