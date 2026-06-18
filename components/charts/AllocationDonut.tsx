"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Slice {
  symbol: string;
  value: number; // portfolio weight 0–100
}

const COLORS = [
  "var(--accent)", "var(--neutral)", "var(--positive)", "var(--accent)", "var(--negative)",
  "var(--neutral)", "#fb923c", "var(--positive)", "#f472b6", "var(--accent)",
];

export function AllocationDonut({ slices, title = "Portfolio allocation" }: { slices: Slice[]; title?: string }) {
  if (!slices.length) {
    return (
      <div className="card-hover rounded-xl glass p-4">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-4 flex h-40 items-center justify-center text-sm text-ink-faint">
          Add holdings to see your allocation.
        </div>
      </div>
    );
  }

  const data = slices.map((s) => ({ name: s.symbol, value: +s.value.toFixed(1) }));

  return (
    <div className="rounded-xl glass p-4">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-xs text-ink-faint mt-0.5">Am I too concentrated in one stock?</div>
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
            contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--hairline-gold)", borderRadius: 10, fontSize: 12 }}
            formatter={(v: number, name: string) => [`${v}%`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--text-dim)" }}
            formatter={(value, entry) => `${value} ${(entry as any).payload?.value ?? ""}%`}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
