"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import useSWR from "swr";
import { sankey, sankeyLinkHorizontal, type SankeyGraph as D3Graph } from "d3-sankey";
import { X } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { DataTimestamp } from "@/components/data-state";
import { FlowList } from "./flow-list";
import type { SankeyGraph as SankeyGraphData } from "@/lib/money/sankey";

// Cash-flow Sankey, skinned entirely to the chart theme (no candy palette).
// Section-accent colors per category, soft-glow bands, ink-faint labels with
// amount + %, savings band in the positive-reinforcement green. Band click opens
// the evidence panel. Mobile: horizontal scroll with the totals pinned above.

interface EvidenceTxn { transactionId: string; date: string; label: string; amount: number }
interface ApiNode { id: string; label: string; kind: string; category?: string }
interface ApiLink { source: string; target: string; value: number; evidence: EvidenceTxn[] }
interface SankeyResp {
  nodes: ApiNode[]; links: ApiLink[];
  totalIncome: number; totalSpending: number; savings: number; savingsRate: number;
  asOf: string; from: string; to: string;
}

// Category accent palette drawn from the app's chart tokens (cohesive, calm).
const CAT_COLORS = ["#16D27E", "#0EA6C9", "#11B4AE", "#34E0A1", "#60A5FA", "#22D3EE", "#A78BFA", "#F59E0B", "#FBBF24"];
const SAVINGS_COLOR = "#16D27E"; // positive-reinforcement green
const INCOME_COLOR = "#34E0A1";
const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CashflowSankeyImpl({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useSWR<SankeyResp>(`/api/money/sankey?from=${from}&to=${to}`, fetchJson, { revalidateOnFocus: false, keepPreviousData: true });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [evidence, setEvidence] = useState<{ title: string; rows: EvidenceTxn[] } | null>(null);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(560, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!data?.nodes?.length) return null;
    const height = Math.max(360, Math.min(640, data.nodes.length * 22));
    const idIndex = new Map(data.nodes.map((n, i) => [n.id, i]));
    const graph: D3Graph<any, any> = {
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.links.map((l) => ({ source: idIndex.get(l.source)!, target: idIndex.get(l.target)!, value: l.value, evidence: l.evidence })),
    } as any;
    const gen = sankey<any, any>().nodeWidth(12).nodePadding(14).extent([[8, 8], [width - 8, height - 8]]);
    try { gen(graph); } catch { return null; }
    return { graph, height };
  }, [data, width]);

  if (isLoading && !data) return <div className="h-[420px] animate-pulse rounded-2xl bg-surface-raised" />;
  if (!data || !layout || !data.nodes.length) {
    return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">Not enough categorized cash flow in this period to draw a flow.</div>;
  }

  const { graph, height } = layout;
  const colorForCat = (cat?: string) => {
    if (!cat) return "#8892a0";
    const cats = Array.from(new Set(data.nodes.filter((n) => n.kind === "category").map((n) => n.category)));
    const i = cats.indexOf(cat);
    return CAT_COLORS[(i < 0 ? 0 : i) % CAT_COLORS.length];
  };
  const nodeColor = (n: any) => n.kind === "savings" ? SAVINGS_COLOR : n.kind === "income" ? INCOME_COLOR : n.kind === "total" ? INCOME_COLOR : colorForCat(n.category);
  const pct = (v: number) => data.totalIncome > 0 ? `${Math.round((v / data.totalIncome) * 100)}%` : "";

  return (
    <div className="space-y-3">
      {/* Pinned totals — always visible even when the chart scrolls on mobile. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-ink-dim">Income <span className="font-semibold text-ink">{money(data.totalIncome)}</span></span>
        <span className="text-ink-dim">Spending <span className="font-semibold text-ink">{money(data.totalSpending)}</span></span>
        <span className="text-emerald-300">Saved <span className="font-semibold">{money(data.savings)}</span> · {Math.round(data.savingsRate * 100)}%</span>
        <span className="ml-auto text-[11px] text-ink-faint"><DataTimestamp asOf={data.asOf} /></span>
      </div>

      {/* Mobile (<md): ranked flow list from the identical graph. */}
      <div className="md:hidden">
        <FlowList graph={data as unknown as SankeyGraphData} />
      </div>

      {/* Desktop (md+): the full d3 Sankey. */}
      <div ref={wrapRef} className="hidden overflow-x-auto rounded-2xl border border-hairline bg-surface p-2 md:block" data-no-page-swipe>
        <svg width={width} height={height} className="min-w-[560px]">
          <defs>
            <filter id="sankey-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Links (bands) */}
          <g fill="none">
            {(graph.links as any[]).map((l, i) => {
              const path = sankeyLinkHorizontal()(l) ?? "";
              const c = nodeColor(l.target.kind === "savings" ? l.target : l.source.kind === "total" ? l.target : l.source);
              return (
                <path key={i} d={path} stroke={c} strokeOpacity={0.28} strokeWidth={Math.max(1, l.width)}
                  className="cursor-pointer transition-[stroke-opacity] hover:!stroke-opacity-50"
                  onClick={() => l.evidence?.length && setEvidence({ title: `${l.source.label} → ${l.target.label}`, rows: l.evidence })}>
                  <title>{l.source.label} → {l.target.label}: {money(l.value)} ({pct(l.value)})</title>
                </path>
              );
            })}
          </g>
          {/* Nodes */}
          <g>
            {(graph.nodes as any[]).map((n, i) => {
              const c = nodeColor(n);
              const h = Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0));
              const leftSide = (n.x0 ?? 0) < width / 2;
              return (
                <g key={i} filter="url(#sankey-glow)">
                  <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={h} fill={c} rx={2} opacity={0.9} />
                  <text x={leftSide ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6} y={(n.y0 ?? 0) + h / 2}
                    textAnchor={leftSide ? "start" : "end"} dominantBaseline="middle"
                    fontSize={11} className="pointer-events-none" style={{ fill: "var(--text-faint)" }}>
                    {n.label} <tspan style={{ fill: "var(--text-dim)" }}>{money(n.value ?? 0)}</tspan>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="hidden text-[11px] text-ink-faint md:block">Transfers and card payments are excluded — you see the spending, never the payment. Tap a band for the transactions behind it.</p>

      {/* Evidence panel */}
      {evidence && (
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">{evidence.title}</div>
            <button onClick={() => setEvidence(null)} className="rounded p-1 text-ink-faint hover:bg-surface-raised hover:text-ink"><X size={14} /></button>
          </div>
          <ul className="mt-2 max-h-64 divide-y divide-white/5 overflow-y-auto text-xs">
            {evidence.rows.slice(0, 100).map((r) => (
              <li key={r.transactionId} className="flex items-center justify-between py-1.5">
                <span className="min-w-0 truncate text-ink-dim">{r.label}</span>
                <span className="shrink-0 tabular-nums text-ink"><span className="mr-2 text-ink-faint">{r.date}</span>{money(r.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
