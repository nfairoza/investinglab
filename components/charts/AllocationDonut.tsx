"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Slice {
  symbol: string;
  value: number; // portfolio weight 0–100
}

const COLORS = [
  "#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f87171",
  "#a78bfa", "#fb923c", "#4ade80", "#f472b6", "#60a5fa",
];

export function AllocationDonut({ slices, title = "Portfolio allocation" }: { slices: Slice[]; title?: string }) {
  if (!slices.length) {
    return (
      <div className="card-hover rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        <div className="mt-4 flex h-40 items-center justify-center text-sm text-slate-500">
          Add holdings to see your allocation.
        </div>
      </div>
    );
  }

  const data = slices.map((s) => ({ name: s.symbol, value: +s.value.toFixed(1) }));

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="text-xs text-slate-500 mt-0.5">Am I too concentrated in one stock?</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v}%`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
            formatter={(value, entry) => `${value} ${(entry as any).payload?.value ?? ""}%`}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
