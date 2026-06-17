"use client";

import { useState } from "react";
import useSWR from "swr";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { useRouter } from "next/navigation";
import { DataBadge, DataTimestamp } from "./data-state";
import type { MapNode } from "@/app/api/map/route";
import type { Holding } from "@/lib/db";

async function getMap(url: string): Promise<{ nodes: MapNode[]; sectors: string[]; period?: string; periods?: string[]; source: any; asOf: string }> {
  const r = await fetch(url);
  return r.json();
}

// Selectable timeline periods + the +/- % each end of the color scale represents.
// Longer windows naturally swing more, so the scale widens (a +4% day is a big
// move; a +4% year is tiny) — keeps the heatmap meaningful at every horizon.
const PERIODS = ["1D", "5D", "1M", "6M", "1Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_LABEL: Record<Period, string> = { "1D": "1 Day", "5D": "1 Week", "1M": "1 Month", "6M": "6 Months", "1Y": "1 Year", "5Y": "5 Years" };
const PERIOD_SCALE: Record<Period, number> = { "1D": 3, "5D": 6, "1M": 12, "6M": 30, "1Y": 50, "5Y": 200 };

// Finviz-style color: green up / red down, intensity scaled to the period.
function colorFor(pct: number, scale: number): string {
  const clamp = Math.max(-scale, Math.min(scale, pct)) / scale; // -1..1
  if (Math.abs(pct) < scale * 0.02) return "#3b4252"; // ~flat = slate
  if (clamp >= 0) {
    const g = ["#1e3a2a", "#1f6b3a", "#249b4a", "#2fbf5a", "#42d672"];
    return g[Math.min(4, Math.floor(clamp * 5))];
  }
  const r = ["#3a1f23", "#6b1f2a", "#9b2435", "#bf2f42", "#e23b4f"];
  return r[Math.min(4, Math.floor(-clamp * 5))];
}

// Custom treemap cell — colored by change, shows symbol + %.
// Text uses a drop shadow + bold weight so it stays readable on any tile color.
function Cell(props: any) {
  const { x, y, width, height, name, changePct, router, scale } = props;
  if (width < 2 || height < 2) return null;
  const fill = colorFor(changePct ?? 0, scale ?? 3);
  const big = width > 36 && height > 22;
  const showPct = width > 46 && height > 40;
  // Scale the ticker font to the tile but keep a readable floor/ceiling.
  const symFont = Math.max(11, Math.min(20, Math.min(width / 3.2, height / 2.4)));
  const cx = x + width / 2;
  const cy = y + height / 2;
  return (
    <g
      onClick={() => name && router?.push(`/research?symbol=${name}`)}
      style={{ cursor: name ? "pointer" : "default" }}
    >
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0a0e0c" strokeWidth={1.5} rx={2} />
      {big && (
        <text
          x={cx} y={showPct ? cy - 6 : cy} textAnchor="middle" dominantBaseline="middle"
          fill="#ffffff" fontSize={symFont} fontWeight={800}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 3, strokeLinejoin: "round" }}
        >
          {name}
        </text>
      )}
      {showPct && (
        <text
          x={cx} y={cy + symFont * 0.7} textAnchor="middle" dominantBaseline="middle"
          fill="#ffffff" fontSize={Math.max(10, symFont * 0.62)} fontWeight={700}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.55)", strokeWidth: 2.5, strokeLinejoin: "round" }}
        >
          {changePct >= 0 ? "+" : ""}{changePct?.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

const MY_HOLDINGS = "My Holdings";

export function StockMap() {
  const router = useRouter();
  const { data: holdings = [] } = useSWR<Holding[]>("/api/map-holdings", () =>
    fetch("/api/holdings").then((r) => r.json()),
  );
  const [period, setPeriod] = useState<Period>("1D");
  // Pass owned tickers so the map includes them even if they're outside the
  // curated large-cap universe (lets "My Holdings" show everything you own).
  const extra = Array.from(new Set(holdings.map((h) => h.symbol.toUpperCase()))).sort().join(",");
  const params = new URLSearchParams({ period });
  if (extra) params.set("extra", extra);
  const mapUrl = `/api/map?${params.toString()}`;
  const { data, isLoading, mutate, isValidating } = useSWR(mapUrl, getMap, {
    refreshInterval: 0, // manual refresh only (many API calls)
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [sector, setSector] = useState("All");
  const scale = PERIOD_SCALE[period];

  const sectors = data?.sectors ?? [];
  const ownedSet = new Set(holdings.map((h) => h.symbol.toUpperCase()));
  const allNodes = data?.nodes ?? [];

  // "My Holdings" view filters the universe to tickers you own. (Only owned names
  // that exist in the map universe appear — others have no live quote here.)
  const nodes =
    sector === MY_HOLDINGS
      ? allNodes.filter((n) => ownedSet.has(n.symbol.toUpperCase()))
      : allNodes.filter((n) => sector === "All" || n.sector === sector);

  // Build treemap data: group by sector for "All"; flat list otherwise.
  const treeData =
    sector === "All"
      ? sectors.map((sec) => ({
          name: sec,
          children: allNodes
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
            className="rounded-md border border-white/10 bg-[#11150f] px-3 py-2 text-sm text-slate-200 focus:border-brand-500 focus:outline-none [&>option]:bg-[#11150f] [&>option]:text-slate-200">
            <option value="All">All sectors</option>
            <option value={MY_HOLDINGS}>★ My Holdings{holdings.length ? ` (${ownedSet.size})` : ""}</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {data && <DataBadge source={data.source} />}
        </div>
        <button onClick={() => mutate()} disabled={isValidating}
          className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {isValidating ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {/* Timeline selector — color tiles by the return over this window. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">Timeline:</span>
        {PERIODS.map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            title={PERIOD_LABEL[p]}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              p === period ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-white/10 text-slate-400 hover:bg-white/5"
            }`}>
            {p}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-slate-500">{PERIOD_LABEL[period]} return</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <span>−{scale}%</span>
        {["#e23b4f", "#bf2f42", "#9b2435", "#3b4252", "#249b4a", "#2fbf5a", "#42d672"].map((c, i) => (
          <span key={i} className="inline-block h-3 w-6" style={{ background: c }} />
        ))}
        <span>+{scale}%</span>
        <span className="ml-3">Size = market cap · click a tile to research it</span>
      </div>

      {/* Map */}
      <div className="glass rounded-2xl p-2">
        {isLoading && <div className="h-[560px] animate-pulse rounded-xl bg-black/30" />}
        {!isLoading && treeData.length === 0 && (
          <div className="flex h-[560px] items-center justify-center px-6 text-center text-sm text-slate-500">
            {sector === MY_HOLDINGS
              ? (holdings.length === 0
                  ? "No holdings yet — add positions or sync a broker to see them here."
                  : "None of your holdings are in the map's large-cap universe yet.")
              : "No data — check your FMP key in Connectors."}
          </div>
        )}
        {!isLoading && treeData.length > 0 && (
          <ResponsiveContainer width="100%" height={560}>
            <Treemap
              data={treeData}
              dataKey="size"
              stroke="#0a0e0c"
              content={<Cell router={router} scale={scale} />}
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
        Live S&amp;P-style heatmap — green up, red down over the selected timeline, tile size = market cap. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
