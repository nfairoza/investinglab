"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis, Dot } from "recharts";
import { useChartTheme } from "./chart-theme";

// Larger sparkline with a soft glow fill and a highlighted last point — the
// Stakent "Top Assets" card chart. Colors by net direction (green up / red down).
export function GlowSparkline({ data, height = 96 }: { data: { v: number }[]; height?: number }) {
  const ct = useChartTheme();
  if (!data || data.length < 2) return <div style={{ height }} />;
  const up = data[data.length - 1].v >= data[0].v;
  const stroke = up ? ct.positive : ct.negative;
  const id = `glow-${Math.round(data[0].v)}-${data.length}-${up ? "u" : "d"}`;
  const lastIdx = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.34} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
          <filter id={`${id}-blur`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        {/* soft glow underlay */}
        <Area dataKey="v" stroke={stroke} strokeOpacity={0.35} strokeWidth={4} fill="none" filter={`url(#${id}-blur)`} isAnimationActive={false} dot={false} activeDot={false} />
        {/* main line + gradient fill, highlight the last point */}
        <Area
          dataKey="v" stroke={stroke} strokeWidth={2} fill={`url(#${id})`} isAnimationActive
          dot={(p: any) => (p.index === lastIdx
            ? <Dot key="last" cx={p.cx} cy={p.cy} r={3.5} fill={stroke} stroke="var(--bg)" strokeWidth={2} />
            : (null as any))}
          activeDot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
