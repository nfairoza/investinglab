"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface HoldingGain {
  symbol: string;
  gain: number; // dollar gain/loss
  gainPct: number;
}

function fmt(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toFixed(0)}`;
}

export function GainLossBar({ holdings, title = "Gain / loss by holding" }: { holdings: HoldingGain[]; title?: string }) {
  if (!holdings.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-4 flex h-32 items-center justify-center text-sm text-slate-500">
          Add holdings to see gains and losses.
        </div>
      </div>
    );
  }

  const sorted = [...holdings].sort((a, b) => b.gain - a.gain);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">What's winning and losing? Green = up, red = down, labeled.</div>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36)}>
          <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false}
              tickFormatter={(v) => `$${v >= 0 ? "+" : ""}${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="symbol" tick={{ fill: "#cbd5e1", fontSize: 12 }} tickLine={false} width={44} />
            <ReferenceLine x={0} stroke="#475569" />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
              formatter={(v: number, _: string, props: any) => {
                const { gainPct } = props.payload as HoldingGain;
                const sign = v >= 0 ? "▲ up" : "▼ down";
                return [`${fmt(v)} (${gainPct.toFixed(1)}%) ${sign}`];
              }}
            />
            <Bar dataKey="gain" radius={[0, 3, 3, 0]} label={{ position: "right", formatter: (v: number) => fmt(v), fill: "#94a3b8", fontSize: 11 }}>
              {sorted.map((entry, i) => (
                <Cell key={i} fill={entry.gain >= 0 ? "#10b981" : "#f87171"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
