"use client";

import useSWR from "swr";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { DataBadge, DataTimestamp, DataNote } from "@/components/data-state";
import type { DataResult, Technicals } from "@/lib/providers/types";

async function getTechnicals(url: string): Promise<DataResult<Technicals>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<Technicals>;
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function PriceHistoryChart({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<Technicals>>(
    `/api/technicals?symbol=${symbol}`,
    getTechnicals,
    { refreshInterval: 5 * 60_000, keepPreviousData: true },
  );

  const t = data?.data;

  // Build chart rows — merge sma50/200 series by date
  const rows = (() => {
    const sma50 = t?.sma50Series ?? [];
    const sma200 = t?.sma200Series ?? [];
    if (!sma50.length && !sma200.length) return [];
    const map = new Map<string, { date: string; sma50?: number; sma200?: number }>();
    for (const p of sma50) map.set(p.date, { date: p.date, sma50: p.value });
    for (const p of sma200) {
      const existing = map.get(p.date) ?? { date: p.date };
      map.set(p.date, { ...existing, sma200: p.value });
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
  })();

  const chartable = rows.length > 0;

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">{symbol} — Moving averages</div>
          <div className="text-xs text-ink-faint mt-0.5">
            Above these lines, the trend is generally healthier.
          </div>
        </div>
        {data && <DataBadge source={data.source} />}
      </div>

      {isLoading && <div className="mt-4 h-48 animate-pulse rounded bg-surface-raised" />}

      {!isLoading && !chartable && (
        <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-hairline text-sm text-ink-faint">
          <DataNote note={data?.note} fallback="Moving averages aren’t available right now." className="px-6 text-center" />
        </div>
      )}

      {chartable && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false}
                tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickLine={false}
                tickFormatter={(v) => `$${v}`} width={56} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-gold)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-dim)" }}
                formatter={(v: number, name: string) => [fmt(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-dim)" }} />
              <Line dataKey="sma50" name="50-day avg" stroke="var(--accent)" dot={false} strokeWidth={1.5} connectNulls />
              <Line dataKey="sma200" name="200-day avg" stroke="var(--neutral)" dot={false} strokeWidth={1.5} connectNulls />
            </LineChart>
          </ResponsiveContainer>

          {t && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-dim">
              {t.sma50 != null && <span>50-day avg: <span className="text-brand-300">${t.sma50.toFixed(2)}</span></span>}
              {t.sma200 != null && <span>200-day avg: <span className="text-indigo-300">${t.sma200.toFixed(2)}</span></span>}
              {t.rsi14 != null && <span>RSI (14): <span className="text-ink">{t.rsi14.toFixed(0)}</span> {t.rsi14 > 70 ? "(overbought)" : t.rsi14 < 30 ? "(oversold)" : ""}</span>}
            </div>
          )}
        </div>
      )}

      {data && <div className="mt-2"><DataTimestamp asOf={data.asOf} /></div>}
      <p className="mt-1 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
