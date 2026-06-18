"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { useChartTheme } from "./chart-theme";

interface Point { v: number; date?: string }

// Minimal area sparkline — no axes/grid. Color by net direction.
// Pass `interactive` for a Robinhood-style hover: a crosshair line and a value/
// date readout that follows the cursor (used on the big portfolio chart).
export function Sparkline({
  data, height = 64, interactive = false, valuePrefix = "$",
}: { data: Point[]; height?: number; interactive?: boolean; valuePrefix?: string }) {
  const ct = useChartTheme();
  if (!data || data.length < 2) return <div style={{ height }} />;
  const up = data[data.length - 1].v >= data[0].v;
  const stroke = up ? ct.positive : ct.negative;
  const id = `spark-${Math.round(data[0].v)}-${data.length}${interactive ? "-i" : ""}`;

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
        {interactive && <XAxis dataKey="date" hide />}
        {interactive && (
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: ct.axis, strokeWidth: 1, strokeDasharray: "3 3" }}
            position={{ y: 0 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div
                  className="rounded-md border px-2 py-1 text-xs shadow-lg"
                  style={{ background: ct.tooltipBg, borderColor: ct.hairline, color: ct.text }}
                >
                  <span className="font-mono font-semibold">
                    {valuePrefix}{Math.round(p.v).toLocaleString()}
                  </span>
                  {p.date && <span className="ml-2 text-[11px]" style={{ color: ct.axis }}>{p.date}</span>}
                </div>
              );
            }}
          />
        )}
        <Area
          dataKey="v" stroke={stroke} strokeWidth={interactive ? 2 : 1.75} fill={`url(#${id})`}
          isAnimationActive={!interactive}
          activeDot={interactive ? { r: 3.5, fill: stroke, stroke: "var(--bg)", strokeWidth: 2 } : false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
