"use client";

import { useState } from "react";
import useSWR from "swr";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { useRouter } from "next/navigation";
import { DataBadge, DataTimestamp } from "./data-state";
import type { MapNode } from "@/app/api/map/route";

async function getMap(url: string): Promise<{ nodes: MapNode[]; sectors: string[]; source: any; asOf: string }> {
  const r = await fetch(url);
  return r.json();
}

// Finviz-style color: green up / red down, intensity by magnitude.
function colorFor(pct: number): string {
  const clamp = Math.max(-3, Math.min(3, pct)) / 3; // -1..1
  if (Math.abs(pct) < 0.05) return "#3b4252"; // flat = slate
  if (clamp >= 0) {
    // green ramp
    const g = [
      "#1e3a2a", "#1f6b3a", "#249b4a", "#2fbf5a", "#42d672",
    ];
    const i = Math.min(4, Math.floor(clamp * 5));
    return g[i];
  }
  const r = ["#3a1f23", "#6b1f2a", "#9b2435", "#bf2f42", "#e23b4f"];
  const i = Math.min(4, Math.floor(-clamp * 5));
  return r[i];
}

// Custom treemap cell — colored by change, shows symbol + %.
function Cell(props: any) {
  const { x, y, width, height, name, changePct, router } = props;
  if (width < 2 || height < 2) return null;
  const fill = colorFor(changePct ?? 0);
  const big = width > 54 && height > 30;
  const showPct = width > 50 && height > 44;
  return (
    <g
      onClick={() => name && router?.push(`/research?symbol=${name}`)}
      style={{ cursor: name ? "pointer" : "default" }}
    >
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0a0e0c" strokeWidth={1} rx={2} />
      {big && (
        <text x={x + width / 2} y={y + height / 2 - (showPct ? 5 : 0)} textAnchor="middle" fill="#fff" fontSize={Math.min(13, width / 4)} fontWeight={600}>
          {name}
        </text>
      )}
      {showPct && (
        <text x={x + width / 2} y={y + height / 2 + 11} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={10}>
          {changePct >= 0 ? "+" : ""}{changePct?.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function StockMap() {
  const router = useRouter();
  const { data, isLoading, mutate, isValidating } = useSWR("/api/map", getMap, {
    refreshInterval: 0, // manual refresh only (many API calls)
    revalidateOnFocus: false,
  });
  const [sector, setSector] = useState("All");

  const sectors = data?.sectors ?? [];
  const nodes = (data?.nodes ?? []).filter((n) => sector === "All" || n.sector === sector);

  // Build treemap data: group by sector (or flat if a sector is selected).
  const treeData =
    sector === "All"
      ? sectors.map((sec) => ({
          name: sec,
          children: (data?.nodes ?? [])
            .filter((n) => n.sector === sec)
            .map((n) => ({ name: n.symbol, size: n.marketCap, changePct: n.changePct })),
        })).filter((s) => s.children.length)
      : [{ name: sector, children: nodes.map((n) => ({ name: n.symbol, size: n.marketCap, changePct: n.changePct })) }];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={sector} onChange={(e) => setSector(e.target.value)}
            className="rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none">
            <option value="All">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {data && <DataBadge source={data.source} />}
        </div>
        <button onClick={() => mutate()} disabled={isValidating}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {isValidating ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <span>−3%</span>
        {["#e23b4f", "#bf2f42", "#9b2435", "#3b4252", "#249b4a", "#2fbf5a", "#42d672"].map((c, i) => (
          <span key={i} className="inline-block h-3 w-6" style={{ background: c }} />
        ))}
        <span>+3%</span>
        <span className="ml-3">Size = market cap · click a tile to research it</span>
      </div>

      {/* Map */}
      <div className="glass rounded-2xl p-2">
        {isLoading && <div className="h-[560px] animate-pulse rounded-xl bg-black/30" />}
        {!isLoading && treeData.length === 0 && (
          <div className="flex h-[560px] items-center justify-center text-sm text-slate-500">
            No data — check your FMP key in Connectors.
          </div>
        )}
        {!isLoading && treeData.length > 0 && (
          <ResponsiveContainer width="100%" height={560}>
            <Treemap
              data={treeData}
              dataKey="size"
              stroke="#0a0e0c"
              content={<Cell router={router} />}
              isAnimationActive={false}
            >
              <Tooltip
                contentStyle={{ background: "rgba(12,16,13,0.95)", border: "1px solid rgba(212,168,42,0.25)", borderRadius: 10, fontSize: 12 }}
                formatter={(v: number, _n: string, p: any) => {
                  const pct = p?.payload?.changePct;
                  return [`${pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%" : ""} · cap ${(v / 1e9).toFixed(0)}B`, p?.payload?.name];
                }}
              />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>

      {data && <DataTimestamp asOf={data.asOf} />}
      <p className="text-[11px] text-slate-600">
        Live S&amp;P-style heatmap — green up, red down today, tile size = market cap. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
