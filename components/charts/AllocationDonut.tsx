"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useChartTheme } from "./chart-theme";

interface Slice {
  symbol: string;
  value: number; // portfolio weight 0–100
}

// Cohesive, on-brand palette: rukMoney teal→green leads, then harmonized hues
// that stay legible on both dark and light. No repeats among the first 10 so
// adjacent slices are always distinguishable. Beyond that falls back to grey.
const PALETTE = [
  "#16D27E", // brand green
  "#0EA6C9", // brand cyan
  "#11B4AE", // brand teal
  "#34E0A1", // mint
  "#60A5FA", // sky
  "#F59E0B", // amber
  "#FB7185", // rose
  "#FBBF24", // gold
  "#22D3EE", // cyan
  "#F472B6", // pink
];
const REST = "var(--neutral)";

function colorAt(i: number) {
  return i < PALETTE.length ? PALETTE[i] : REST;
}

export function AllocationDonut({ slices, title = "Portfolio allocation" }: { slices: Slice[]; title?: string }) {
  const ct = useChartTheme();

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
  const top = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);

  return (
    <div className="card-hover rounded-xl glass p-4">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-xs text-ink-faint mt-0.5">Am I too concentrated in one stock?</div>

      <div className="relative mt-2">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={2}
              cornerRadius={5}
              dataKey="value"
              stroke="var(--bg)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colorAt(i)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.hairline}`, borderRadius: 10, fontSize: 12, color: ct.text }}
              itemStyle={{ color: ct.text }}
              formatter={(v: number, name: string) => [`${v}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — largest position */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold text-ink">{top.value}%</span>
          <span className="text-[11px] text-ink-faint">{top.name}</span>
        </div>
      </div>

      {/* Custom legend chips — wrap, color dot + symbol + weight */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {data.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-ink-dim">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorAt(i) }} />
            <span className="font-medium text-ink">{d.name}</span>
            <span className="text-ink-faint">{d.value}%</span>
          </span>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}
