"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Landmark, TrendingUp, TrendingDown, ExternalLink, Info, Users, X } from "lucide-react";
import { DataBadge, DataTimestamp } from "./data-state";
import { MotionLoader } from "./motion-loader";
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
  generatedAt?: string | null;
  cached?: boolean;
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
  LOW: "border-hairline-strong bg-surface/30 text-ink-dim",
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
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-raised" title={segs.map((x) => `${x.label}: ${x.v}/${x.max}`).join(" · ")}>
      {segs.map((seg, i) => (
        <div key={i} className={seg.c} style={{ width: `${(seg.v / 100) * 100}%` }} />
      ))}
    </div>
  );
}

export function CongressAlphaFeed() {
  const [days, setDays] = useState(90);
  // Always fetch the FULL YEAR once, then filter the window CLIENT-SIDE. This
  // guarantees every window is a strict subset of the same dataset (6mo always
  // contains 90d, etc.) — fixes windows that sometimes showed no data — and
  // makes switching windows instant (no refetch).
  const { data, isLoading, isValidating, mutate } = useSWR<AlphaResult>(`/api/congress/alpha?limit=400&days=365`, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  // Force a fresh rebuild (bypasses the 12h server cache) then revalidate.
  async function reanalyze() {
    await fetch(`/api/congress/alpha?limit=400&days=365&refresh=1`).catch(() => {});
    mutate();
  }
  const [minTier, setMinTier] = useState<"HIGH" | "MEDIUM" | "ALL">("HIGH");
  const [selected, setSelected] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  // Select a trade AND bring the Conflict Inspector into view. On narrow screens
  // the inspector sits below the feed, so without scrolling "Inspect" looked dead.
  const inspect = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [member, setMember] = useState<string | null>(null); // politician quick-filter

  // Window cutoff (client-side) using the trade date, with a safe fallback.
  const cutoffMs = Date.now() - days * 86_400_000;
  const inWindow = (r: ScoredTrade) => {
    const d = new Date(r.txDate || r.disclosureDate).getTime();
    return Number.isNaN(d) || d >= cutoffMs;
  };

  // Distinct members present (for the quick-filter widget), by trade count.
  const memberCounts = new Map<string, number>();
  for (const r of data?.rows ?? []) if (inWindow(r)) memberCounts.set(r.representative, (memberCounts.get(r.representative) ?? 0) + 1);
  const topMembers = [...memberCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const rows = (data?.rows ?? []).filter((r) => {
    if (!inWindow(r)) return false;
    if (member && r.representative !== member) return false;
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
            <span className="mr-1 text-xs text-ink-faint">Show:</span>
            {(["HIGH", "MEDIUM", "ALL"] as const).map((t) => (
              <button key={t} onClick={() => setMinTier(t)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  t === minTier ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
                }`}>
                {t === "HIGH" ? "High conviction" : t === "MEDIUM" ? "Medium+" : "All"}
              </button>
            ))}
          </div>
          {/* Time window */}
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-ink-faint">Window:</span>
            {WINDOWS.map((w) => (
              <button key={w.days} onClick={() => setDays(w.days)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  w.days === days ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
                }`}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.generatedAt && (
            <span className="text-[11px] text-ink-faint">Analyzed {new Date(data.generatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          )}
          {data && <DataBadge source={data.source} />}
          <button onClick={reanalyze} disabled={isValidating}
            className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim hover:bg-surface-raised disabled:opacity-50">
            {isValidating ? "Re-analyzing…" : "Re-analyze"}
          </button>
        </div>
      </div>

      {/* Score-bar legend — what the colored segments mean. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-hairline bg-black/15 px-3 py-2 text-[11px] text-ink-dim">
        <span className="text-ink-faint">Score bar:</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-sky-500" /> Capital scale (25)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-brand-500" /> Committee edge (40)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-violet-500" /> Cluster (20)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Options est. (15)</span>
        <span className="text-ink-faint">— longer bar = higher conviction</span>
      </div>

      {!data?.rosterOk && data && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-300/90">
          Committee roster unavailable{data.rosterNote ? ` (${data.rosterNote})` : ""} — committee-edge scoring is paused; scores reflect capital + clustering only.
        </div>
      )}

      {isLoading && <MotionLoader page="congress" height={240} label="Scoring disclosures, joining committees, and reading the tape…" />}

      {!isLoading && data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Module 1: Alpha Feed */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Landmark size={16} className="text-brand-400" /> Alpha Feed — {rows.length} trades
            </div>
            {rows.length === 0 && (
              <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-faint">
                No trades at this conviction level. Try “All”.
              </div>
            )}
            {/* Whole card → opens the official filing (source). The ticker chip
                → Research for that ticker. "Inspect" → loads the Conflict
                Inspector on the right without leaving the page. */}
            {rows.map((r) => {
              const cardClickable = Boolean(r.sourceLink);
              return (
              <div key={r.id}
                onClick={() => { if (r.sourceLink) window.open(r.sourceLink, "_blank", "noopener,noreferrer"); }}
                className={`group w-full rounded-xl border p-3 text-left transition-colors ${cardClickable ? "cursor-pointer" : ""} ${
                  sel?.id === r.id ? "border-brand-500/50 bg-brand-500/[0.06]" : "border-hairline bg-black/15 hover:bg-white/[0.03]"
                }`}>
                <div className="flex items-center gap-3">
                  <Link href={`/research?symbol=${r.ticker}`} onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-md bg-surface-raised px-2 py-1 font-bold text-brand-300 hover:bg-brand-500/15" title={`Research ${r.ticker}`}>
                    {r.ticker}
                  </Link>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${r.action === "BUY" ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/40 text-rose-300"}`}>
                    {r.action === "BUY" ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {r.action}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-dim">
                    {r.representative}{r.party ? ` (${r.party})` : ""} · {r.chamber}
                  </span>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${TIER_CLS[r.tier]}`}>
                    {r.convictionScore}/{r.maxPossible}
                  </span>
                </div>
                <div className="mt-2"><ScoreBar s={r} /></div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-surface px-1.5 py-0.5 text-ink-dim">{r.sizeTranche}</span>
                  {r.committeeTag && (
                    <span className={`rounded px-1.5 py-0.5 ${r.conflictLevel === "primary" ? "bg-brand-500/15 text-brand-300" : "bg-surface/40 text-ink-dim"}`}>
                      ⚖ {r.committeeTag}
                    </span>
                  )}
                  {r.clusterCount > 1 && (
                    <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-300">
                      ✦ cluster ×{r.clusterCount}{r.clusterCrossParty ? " · cross-party" : ""}
                    </span>
                  )}
                  <span className="text-ink-faint">traded {r.txDate}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); inspect(r.id); }}
                      className="inline-flex items-center gap-1 rounded border border-hairline px-1.5 py-0.5 text-ink-dim hover:bg-surface hover:text-ink">
                      <Info size={11} /> Inspect
                    </button>
                    {cardClickable && <ExternalLink size={11} className="text-ink-faint group-hover:text-brand-400" />}
                  </span>
                </div>
              </div>
              );
            })}
          </div>

          {/* Right column: Politicians + Conflict Inspector + Macro */}
          <div className="space-y-4">
            {/* Politician quick-filter — click a name to filter the feed to them */}
            {topMembers.length > 0 && (
              <div className="rounded-xl glass p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Users size={15} className="text-brand-400" /> People in current feed</div>
                  {member && (
                    <button onClick={() => setMember(null)} className="inline-flex items-center gap-1 rounded border border-hairline px-1.5 py-0.5 text-[11px] text-ink-dim hover:text-ink">
                      <X size={11} /> Clear
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-faint">Showing people with parsed records in the currently enabled sources. Tap a name to filter the feed. For the full roster, open the People Directory.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topMembers.map(([name, count]) => (
                    <button key={name} onClick={() => setMember(member === name ? null : name)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${member === name ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface hover:text-ink"}`}>
                      {name} <span className="text-ink-faint">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Module 2: Legislative Conflict Inspector */}
            <div ref={inspectorRef} className="scroll-mt-20 rounded-xl glass p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Info size={15} className="text-brand-400" /> Conflict Inspector
              </div>
              {sel ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="font-bold text-brand-300">{sel.ticker}</span>
                    <span className="text-xs text-ink-faint">{sel.sector}</span>
                  </div>
                  <div className="text-ink-dim">{sel.representative}{sel.party ? ` (${sel.party})` : ""} · {sel.chamber}</div>
                  <div className={`rounded-lg border p-2 text-xs ${sel.conflictLevel === "primary" ? "border-brand-500/40 bg-brand-500/5 text-ink" : sel.conflictLevel === "secondary" ? "border-amber-500/30 bg-amber-500/5 text-amber-200" : "border-hairline bg-surface text-ink-dim"}`}>
                    {sel.conflictRationale}
                  </div>
                  {/* Score breakdown */}
                  <div className="space-y-1 pt-1 text-xs text-ink-dim">
                    <Row label="Capital scale" v={sel.breakdown.capital} max={25} />
                    <Row label="Committee edge" v={sel.breakdown.edge} max={40} />
                    <Row label="Cluster signal" v={sel.breakdown.cluster} max={20} />
                    <Row label="Options (estimated)" v={sel.breakdown.options} max={15} />
                    <div className="flex justify-between border-t border-hairline pt-1 font-semibold text-ink">
                      <span>Conviction</span><span>{sel.convictionScore}/{sel.maxPossible}</span>
                    </div>
                  </div>
                  {/* Options read */}
                  <div className="rounded-lg border border-hairline bg-surface p-2 text-xs">
                    <div className="text-ink-faint">Options read <span className="text-ink-faint">(AI-estimated)</span></div>
                    <div className={`font-medium ${sel.optionsValidation === "BULLISH" ? "text-emerald-300" : sel.optionsValidation === "BEARISH" ? "text-rose-300" : "text-ink-dim"}`}>
                      {sel.optionsValidation}
                    </div>
                  </div>
                  {sel.thesis && (
                    <div className="rounded-lg border border-hairline bg-surface p-2 text-xs text-ink-dim">
                      <div className="mb-0.5 text-ink-faint">AI thesis</div>{sel.thesis}
                    </div>
                  )}
                  {sel.sourceLink && (
                    <a href={sel.sourceLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-400 hover:underline">
                      Official filing <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink-faint">Select a trade to inspect.</p>
              )}
            </div>

            {/* Module 3: Macro / Roster */}
            {data.macro && (
              <div className="rounded-xl glass p-4">
                <div className="text-sm font-semibold text-ink">Capitol Hill macro ({data.windowDays ?? days}d)</div>
                <div className="mt-2 text-xs text-ink-faint">Net buying/selling by sector (min disclosed $)</div>
                <div className="mt-2 space-y-1">
                  {data.macro.sectors.slice(0, 6).map((s) => (
                    <div key={s.sector} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 truncate text-ink-dim">{s.sector}</span>
                      <div className="flex h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                        <div className={s.net >= 0 ? "bg-emerald-500" : "bg-rose-500"} style={{ width: "100%" }} />
                      </div>
                      <span className={`w-14 shrink-0 text-right ${s.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {s.net >= 0 ? "+" : "−"}{money(Math.abs(s.net))}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-ink-faint">Most active members</div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {data.macro.topMembers.map((m) => (
                    <li key={m.member} className="flex justify-between text-ink-dim">
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
        {data?.aiProvider && <span className="text-[11px] text-ink-faint">Thesis + options estimate: {data.aiProvider}</span>}
      </div>
    </div>
  );
}

function Row({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span><span className="text-ink-dim">{v}/{max}</span>
    </div>
  );
}
