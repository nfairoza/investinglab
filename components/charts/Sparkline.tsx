"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { useChartTheme } from "./chart-theme";

// Minimal area sparkline — no axes/grid/tooltip. Color by net direction.
export function Sparkline({ data, height = 64 }: { data: { v: number }[]; height?: number }) {
  const ct = useChartTheme();
  if (!data || data.length < 2) return <div style={{ height }} />;
  const up = data[data.length - 1].v >= data[0].v;
  const stroke = up ? ct.positive : ct.negative;
  const id = `spark-${Math.round(data[0].v)}-${data.length}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Area dataKey="v" stroke={stroke} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  );
}
