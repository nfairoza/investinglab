"use client";

import { useState } from "react";
import useSWR from "swr";
import { Landmark, TrendingUp, TrendingDown, ExternalLink, Info } from "lucide-react";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataSource } from "@/lib/providers/types";

interface ScoredTrade {
  id: string;
  ticker: string | null;
  companyName: string;
  representative: string;
  chamber: "House" | "Senate";
  party: string;
  action: "BUY" | "SELL";
  sizeTranche: string;
  sector: string;
  committeeTag: string | null;
  conflictLevel: "primary" | "secondary" | "none";
  conflictRationale: string;
  clusterCount: number;
  clusterCrossParty: boolean;
  optionsValidation: "BULLISH" | "BEARISH" | "NEUTRAL";
  optionsEstimated: boolean;
  convictionScore: number;
  maxPossible: number;
  tier: "HIGH" | "MEDIUM" | "LOW";
  breakdown: { capital: number; edge: number; cluster: number; options: number };
  txDate: string;
  disclosureDate: string;
  sourceLink: string | null;
  thesis: string;
}
interface Macro {
  sectors: { sector: string; net: number; buy: number; sell: number }[];
  topMembers: { member: string; trades: number }[];
}
interface AlphaResult {
  rows: ScoredTrade[];
  macro: Macro | null;
  windowDays?: number;
  tradeCount?: number;
  source: DataSource;
  asOf: string | null;
  rosterOk: boolean;
  rosterNote?: string;
  optionsEstimated: boolean;
  aiProvider: string | null;
}

const WINDOWS: { days: number; label: string }[] = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 180, label: "6mo" },
  { days: 365, label: "1yr" },
];

const fetcher = (u: string) => fetch(u).then((r) => r.json());

const TIER_CLS: Record<string, string> = {
  HIGH: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  MEDIUM: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  LOW: "border-slate-600 bg-slate-700/30 text-slate-400",
};

function money(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}

function ScoreBar({ s }: { s: ScoredTrade }) {
  const segs = [
    { v: s.breakdown.capital, max: 25, c: "bg-sky-500", label: "Capital scale" },
    { v: s.breakdown.edge, max: 40, c: "bg-brand-500", label: "Committee edge" },
    { v: s.breakdown.cluster, max: 20, c: "bg-violet-500", label: "Cluster" },
    { v: s.breakdown.options, max: 15, c: "bg-emerald-500", label: "Options (est.)" },
  ];
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800" title={segs.map((x) => `${x.label}: ${x.v}/${x.max}`).join(" · ")}>
      {segs.map((seg, i) => (
        <div key={i} className={seg.c} style={{ width: `${(seg.v / 100) * 100}%` }} />
      ))}
    </div>
  );
}

export function CongressAlphaFeed() {
  const [days, setDays] = useState(90);
  const { data, isLoading, isValidating, mutate } = useSWR<AlphaResult>(`/api/congress/alpha?limit=300&days=${days}`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [minTier, setMinTier] = useState<"HIGH" | "MEDIUM" | "ALL">("HIGH");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = (data?.rows ?? []).filter((r) => {
    if (minTier === "ALL") return true;
    if (minTier === "HIGH") return r.tier === "HIGH";
    return r.tier !== "LOW"; // MEDIUM+
  });
  const sel = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  return (
    <div className="space-y-4">
      {/* Honesty banner */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
        <span className="font-medium">Lagged disclosure</span> (up to 45 days), amounts are{" "}
        <span className="font-medium">ranges</span>, and the options read is{" "}
        <span className="font-medium">AI-estimated, not live institutional flow</span>. Conviction
        score is a transparent rules-based signal, not a buy/sell recommendation.
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-500">Show:</span>
            {(["HIGH", "MEDIUM", "ALL"] as const).map((t) => (
              <button key={t} onClick={() => setMinTier(t)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  t === minTier ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-white/10 text-slate-400 hover:bg-white/5"
                }`}>
                {t === "HIGH" ? "High conviction" : t === "MEDIUM" ? "Medium+" : "All"}
              </button>
            ))}
          </div>
          {/* Time window */}
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-slate-500">Window:</span>
            {WINDOWS.map((w) => (
              <button key={w.days} onClick={() => setDays(w.days)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  w.days === days ? "border-brand-500/60 bg-brand-500/15 text-brand-200" : "border-white/10 text-slate-400 hover:bg-white/5"
                }`}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && <DataBadge source={data.source} />}
          <button onClick={() => mutate()} disabled={isValidating}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            {isValidating ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Score-bar legend — what the colored segments mean. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-[11px] text-slate-400">
        <span className="text-slate-500">Score bar:</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-sky-500" /> Capital scale (25)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-brand-500" /> Committee edge (40)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-violet-500" /> Cluster (20)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Options est. (15)</span>
        <span className="text-slate-600">— longer bar = higher conviction</span>
      </div>

      {!data?.rosterOk && data && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300/90">
          Committee roster unavailable{data.rosterNote ? ` (${data.rosterNote})` : ""} — committee-edge scoring is paused; scores reflect capital + clustering only.
        </div>
      )}

      {isLoading && <div className="h-64 animate-pulse rounded-xl bg-slate-800" />}

      {!isLoading && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Module 1: Alpha Feed */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Landmark size={16} className="text-brand-400" /> Alpha Feed — {rows.length} trades
            </div>
            {rows.length === 0 && (
              <div className="rounded-lg border border-white/5 bg-black/20 p-6 text-center text-sm text-slate-500">
                No trades at this conviction level. Try “All”.
              </div>
            )}
            {rows.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  sel?.id === r.id ? "border-brand-500/50 bg-brand-500/[0.06]" : "border-white/10 bg-black/15 hover:bg-white/[0.03]"
                }`}>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 rounded-md bg-slate-800 px-2 py-1 font-bold text-brand-300">{r.ticker}</span>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${r.action === "BUY" ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
                    {r.action === "BUY" ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {r.action}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-300">
                    {r.representative}{r.party ? ` (${r.party})` : ""} · {r.chamber}
                  </span>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${TIER_CLS[r.tier]}`}>
                    {r.convictionScore}/{r.maxPossible}
                  </span>
                </div>
                <div className="mt-2"><ScoreBar s={r} /></div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-slate-800/60 px-1.5 py-0.5 text-slate-300">{r.sizeTranche}</span>
                  {r.committeeTag && (
                    <span className={`rounded px-1.5 py-0.5 ${r.conflictLevel === "primary" ? "bg-brand-500/15 text-brand-300" : "bg-slate-700/40 text-slate-400"}`}>
                      ⚖ {r.committeeTag}
                    </span>
                  )}
                  {r.clusterCount > 1 && (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">
                      ✦ cluster ×{r.clusterCount}{r.clusterCrossParty ? " · cross-party" : ""}
                    </span>
                  )}
                  <span className="text-slate-600">traded {r.txDate}</span>
                  {r.sourceLink && (
                    <a href={r.sourceLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                      className="ml-auto inline-flex items-center gap-1 text-brand-400 hover:underline">
                      Source <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Right column: Conflict Inspector + Macro */}
          <div className="space-y-4">
            {/* Module 2: Legislative Conflict Inspector */}
            <div className="rounded-xl glass p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Info size={15} className="text-brand-400" /> Conflict Inspector
              </div>
              {sel ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-brand-300">{sel.ticker}</span>
                    <span className="text-xs text-slate-500">{sel.sector}</span>
                  </div>
                  <div className="text-slate-300">{sel.representative}{sel.party ? ` (${sel.party})` : ""} · {sel.chamber}</div>
                  <div className={`rounded-lg border p-2 text-xs ${sel.conflictLevel === "primary" ? "border-brand-500/40 bg-brand-500/5 text-brand-200" : sel.conflictLevel === "secondary" ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-white/10 bg-black/20 text-slate-400"}`}>
                    {sel.conflictRationale}
                  </div>
                  {/* Score breakdown */}
                  <div className="space-y-1 pt-1 text-xs text-slate-400">
                    <Row label="Capital scale" v={sel.breakdown.capital} max={25} />
                    <Row label="Committee edge" v={sel.breakdown.edge} max={40} />
                    <Row label="Cluster signal" v={sel.breakdown.cluster} max={20} />
                    <Row label="Options (estimated)" v={sel.breakdown.options} max={15} />
                    <div className="flex justify-between border-t border-white/10 pt-1 font-semibold text-slate-200">
                      <span>Conviction</span><span>{sel.convictionScore}/{sel.maxPossible}</span>
                    </div>
                  </div>
                  {/* Options read */}
                  <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
                    <div className="text-slate-500">Options read <span className="text-slate-600">(AI-estimated)</span></div>
                    <div className={`font-medium ${sel.optionsValidation === "BULLISH" ? "text-emerald-300" : sel.optionsValidation === "BEARISH" ? "text-rose-300" : "text-slate-300"}`}>
                      {sel.optionsValidation}
                    </div>
                  </div>
                  {sel.thesis && (
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
                      <div className="mb-0.5 text-slate-500">AI thesis</div>{sel.thesis}
                    </div>
                  )}
                  {sel.sourceLink && (
                    <a href={sel.sourceLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-400 hover:underline">
                      Official filing <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Select a trade to inspect.</p>
              )}
            </div>

            {/* Module 3: Macro / Roster */}
            {data.macro && (
              <div className="rounded-xl glass p-4">
                <div className="text-sm font-semibold text-slate-100">Capitol Hill macro ({data.windowDays ?? days}d)</div>
                <div className="mt-2 text-xs text-slate-500">Net buying/selling by sector (min disclosed $)</div>
                <div className="mt-2 space-y-1">
                  {data.macro.sectors.slice(0, 6).map((s) => (
                    <div key={s.sector} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate text-slate-300">{s.sector}</span>
                      <div className="flex h-2 flex-1 overflow-hidden rounded bg-slate-800">
                        <div className={s.net >= 0 ? "bg-emerald-500" : "bg-rose-500"} style={{ width: "100%" }} />
                      </div>
                      <span className={`w-14 shrink-0 text-right ${s.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {s.net >= 0 ? "+" : "−"}{money(Math.abs(s.net))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-500">Most active members</div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {data.macro.topMembers.map((m) => (
                    <li key={m.member} className="flex justify-between text-slate-400">
                      <span className="truncate">{m.member}</span><span>{m.trades}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        {data && <DataTimestamp asOf={data.asOf} />}
        {data?.aiProvider && <span className="text-[11px] text-slate-600">Thesis + options estimate: {data.aiProvider}</span>}
      </div>
    </div>
  );
}

function Row({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span><span className="text-slate-300">{v}/{max}</span>
    </div>
  );
}
