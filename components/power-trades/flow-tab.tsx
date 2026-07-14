"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { TrendingUp, Lock } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useEntitlement } from "@/components/use-entitlement";
import { DataTimestamp } from "@/components/data-state";

// PT6 — Flow tab. Sector heatmap of congressional net buying + top net-bought/
// sold tickers, with chamber/party filters. Reads the cron-built cache; asOf
// shown. Plan-gated (pt_flow_views = Premium).
interface SectorFlow { sector: string; netBuy: number; buyVol: number; sellVol: number; trades: number }
interface TickerFlow { ticker: string; net: number; trades: number }
interface FlowResp { bySector: SectorFlow[]; topBought: TickerFlow[]; topSold: TickerFlow[]; months: string[]; totalTrades: number; asOf: string | null }

const money = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
};

export function FlowTab() {
  const entitled = useEntitlement("pt_flow_views");
  const [chamber, setChamber] = useState<"all" | "house" | "senate">("all");
  const [party, setParty] = useState<"all" | "D" | "R" | "I">("all");
  const qs = new URLSearchParams({ chamber, party }).toString();
  const { data, isLoading } = useSWR<FlowResp>(entitled ? `/api/power-trades/flow?${qs}` : null, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });

  if (!entitled) {
    return (
      <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-sm text-ink-dim">
        <Lock size={22} className="mx-auto text-ink-faint" />
        <p className="mt-2">Flow views are a Premium feature — the monthly sector heatmap of congressional net buying and top net-bought/sold names.</p>
      </div>
    );
  }

  const bySector = data?.bySector ?? [];
  // Treemap wants positive sizes; color by buy (emerald) vs sell (rose).
  const treeData = bySector.map((s) => ({ name: s.sector, size: Math.abs(s.netBuy) || 1, netBuy: s.netBuy }));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Seg label="Chamber" value={chamber} onChange={(v) => setChamber(v as any)} opts={[["all", "All"], ["house", "House"], ["senate", "Senate"]]} />
        <Seg label="Party" value={party} onChange={(v) => setParty(v as any)} opts={[["all", "All"], ["D", "Dem"], ["R", "Rep"], ["I", "Ind"]]} />
        {data?.asOf && <span className="ml-auto text-[11px] text-ink-faint"><DataTimestamp asOf={data.asOf} /></span>}
      </div>

      {isLoading && !data ? <div className="h-56 animate-pulse rounded-2xl bg-surface-raised" />
       : bySector.length === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">
          No flow for this filter yet. Congressional trades are aggregated over the last 90 days once synced.
        </div>
      ) : (
        <>
          {/* Sector heatmap */}
          <div className="rounded-2xl border border-hairline p-3">
            <div className="mb-1 text-sm font-semibold text-ink">Net buying by sector (last 90d)</div>
            <div className="h-64" data-no-page-swipe>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={treeData} dataKey="size" nameKey="name" stroke="var(--bg)"
                  content={<SectorCell />} isAnimationActive={false}>
                  <Tooltip content={<SectorTip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[10px] text-ink-faint">Green = net buying, red = net selling. Size ∝ |net flow|. Weighted by disclosed band midpoints (internal only; rows always show the band).</p>
          </div>

          {/* Top net-bought / net-sold */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TickerList title="Top net-bought" rows={data!.topBought} tone="emerald" />
            <TickerList title="Top net-sold" rows={data!.topSold} tone="rose" />
          </div>
        </>
      )}
    </div>
  );
}

function Seg({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-hairline">
        {opts.map(([v, l]) => (
          <button key={v} onClick={() => onChange(v)} className={`px-2.5 py-1 text-xs ${value === v ? "tab-active" : "text-ink-dim hover:bg-surface"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function TickerList({ title, rows, tone }: { title: string; rows: TickerFlow[]; tone: "emerald" | "rose" }) {
  const cls = tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="rounded-2xl border border-hairline p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink"><TrendingUp size={14} className={cls} /> {title}</div>
      {rows.length === 0 ? <p className="text-xs text-ink-faint">None in this window.</p> : (
        <ul className="divide-y divide-white/5">
          {rows.map((r) => (
            <li key={r.ticker} className="flex items-center justify-between py-1.5 text-sm">
              <Link href={`/research?symbol=${r.ticker}`} className="font-mono text-brand-300 hover:underline">{r.ticker}</Link>
              <span className={`tabular-nums ${cls}`}>{r.net > 0 ? "+" : ""}{money(r.net)} <span className="text-ink-faint">· {r.trades}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Treemap cell colored by net-buy sign; label when the box is big enough.
function SectorCell(props: any) {
  const { x, y, width, height, name, netBuy } = props;
  if (width == null) return null;
  const buy = (netBuy ?? 0) >= 0;
  const fill = buy ? "rgba(22,210,126,0.28)" : "rgba(251,113,133,0.28)";
  const stroke = buy ? "rgba(22,210,126,0.6)" : "rgba(251,113,133,0.6)";
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} />
      {width > 60 && height > 24 && (
        <text x={x + 6} y={y + 18} className="fill-ink" fontSize={11} style={{ fill: "var(--text)" }}>{name}</text>
      )}
    </g>
  );
}
function SectorTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-hairline bg-surface-solid px-2.5 py-1.5 text-xs text-ink">
      <div className="font-semibold">{d.name}</div>
      <div className={d.netBuy >= 0 ? "text-emerald-300" : "text-rose-300"}>{d.netBuy >= 0 ? "net buying " : "net selling "}{money(Math.abs(d.netBuy))}</div>
    </div>
  );
}
