"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import useSWR from "swr";
import { usePersistedState } from "@/lib/use-persisted-state";
import { Stethoscope, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { DataBadge, friendlyMessage } from "./data-state";
import { useIsAdmin } from "./use-is-admin";
import { AllocationDonut } from "./charts/AllocationDonut";
import { MotionLoader } from "./motion-loader";
import type { Holding } from "@/lib/db";
import type { DataSource } from "@/lib/providers/types";

interface Move {
  symbol: string;
  action: string;
  amountUsd: number;
  shares: number | null;
  reason: string;
  isNew?: boolean;
}
interface HorizonPlan {
  horizon: string;
  stance: string;
  sells: Move[];
  buys: Move[];
}
interface Diagnostic { title: string; severity: "good" | "watch" | "warning"; detail: string; }
interface Analysis {
  healthScore: number;
  healthGrade: string;
  summary: string;
  biggestRisk: string;
  diagnostics: Diagnostic[];
  concentration: { topPositionPct: number; topSectorPct: number; note: string };
  horizons: HorizonPlan[];
}
interface Position {
  symbol: string; value: number; weightPct: number; price: number | null;
  changePct: number | null; shares: number; sector: string; score: number | null; scoreLabel: string | null;
}
interface Result {
  analysis: Analysis;
  portfolio: { totalValue: number; positions: Position[]; sectors: { sector: string; value: number; pct: number }[] };
  dataSource: DataSource;
  sourceLabel: string;
  model: string;
  generatedAt: string;
}

const GRADE_CLS: Record<string, string> = {
  A: "text-emerald-300 border-emerald-500/50 bg-emerald-500/10",
  B: "text-lime-300 border-lime-500/50 bg-lime-500/10",
  C: "text-amber-300 border-amber-500/50 bg-amber-500/10",
  D: "text-orange-300 border-orange-500/50 bg-orange-500/10",
  F: "text-rose-300 border-rose-500/50 bg-rose-500/10",
};
const SEV_CLS: Record<string, string> = {
  good: "border-emerald-500/30 bg-emerald-500/5 text-emerald-200",
  watch: "border-amber-500/30 bg-amber-500/5 text-amber-200",
  warning: "border-rose-500/30 bg-rose-500/5 text-rose-200",
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export function PortfolioDoctor() {
  const isAdmin = useIsAdmin();
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings?withBrokers=1", (u: string) => fetch(u).then((r) => r.json()));
  const [busy, setBusy] = useState(false);
  // Persisted so the diagnosis survives navigation/reload until you re-run.
  const [result, setResult] = usePersistedState<Result | null>("pf-doctor-result", null);
  const [error, setError] = useState<string | null>(null);
  const [activeHorizon, setActiveHorizon] = useState(0);

  // On mount: load the cached daily diagnosis (no tokens). POST only re-runs
  // when allowed (admin force, stale, or holdings changed) — for regular users
  // this just refreshes/serves the cached one and never lets them spend tokens.
  const ranAuto = useRef(false);
  useEffect(() => {
    if (ranAuto.current) return;
    ranAuto.current = true;
    (async () => {
      try {
        const j = await fetch("/api/portfolio-doctor").then((r) => r.json());
        if (j?.analysis) setResult(j as Result);
        else run(); // no cache yet → generate the first one (auto-runs on holdings change too)
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(force = false) {
    if (busy) return;
    setBusy(true); setError(null); // keep the previous result visible until the new one lands
    try {
      const r = await fetch(`/api/portfolio-doctor${force ? "?force=1" : ""}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setError(j.message ?? "Analysis failed."); return; }
      setResult(j as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const totalValue = holdings.reduce((s, h) => s + h.avgCost * h.shares, 0);
  const active = result?.analysis.horizons?.[activeHorizon];

  return (
    <div className="space-y-5">
      {/* Intro / run */}
      <div className="rounded-xl glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope size={20} className="text-brand-400" />
            <h2 className="text-lg font-semibold text-ink">Portfolio check-up</h2>
          </div>
          {/* Re-run is admin-only (token control). Users see the daily cached
              diagnosis, which auto-refreshes when their holdings change. */}
          {(isAdmin || !result) && (
            <button onClick={() => run(isAdmin)} disabled={busy || holdings.length === 0}
              className="btn-gold rounded-md px-4 py-2 text-sm disabled:opacity-50">
              {busy ? "Examining…" : result ? "Re-run diagnosis" : "Run full diagnosis"}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-dim">
          The doctor reads all {holdings.length} of your holdings and their weights, scores and researches each,
          checks concentration & sector risk, then recommends specific buy/sell amounts — across 1-day, 1-month,
          6-month, 1-year and 5-year horizons. It can also suggest new positions from the whole market.
          {!isAdmin && result && <span className="text-ink-faint"> Refreshed daily and whenever your holdings change.</span>}
        </p>
        {holdings.length === 0 && (
          <p className="mt-2 text-sm text-amber-300">
            Add holdings (or sync a broker) first — <a href="/holdings" className="underline">go to Holdings</a>.
          </p>
        )}
        {holdings.length > 0 && !result && !busy && (
          <p className="mt-2 text-xs text-ink-faint">Current portfolio value ≈ {money(totalValue)} (at cost; live values load when you run).</p>
        )}
      </div>

      {busy && (
        <MotionLoader page="doctor" height={220} label="Scoring each holding, pulling live data, and searching recent news…" />
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
          {isAdmin ? error : friendlyMessage(error)}
          {isAdmin && (error.includes("Connectors") || error.includes("key") || error.includes("Claude")) && (
            <a href="/connectors" className="ml-1 underline">Open Connectors</a>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-5 animate-fade-in-up">
          {/* Health header */}
          <div className="rounded-xl glass p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border text-3xl font-bold ${GRADE_CLS[result.analysis.healthGrade] ?? GRADE_CLS.C}`}>
                  {result.analysis.healthGrade}
                </div>
                <div>
                  <div className="text-sm text-ink-dim">Whole-portfolio health</div>
                  <div className="text-2xl font-bold text-ink">{result.analysis.healthScore}/100</div>
                  <div className="text-xs text-ink-faint">Diversification & concentration · value ≈ {money(result.portfolio.totalValue)}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <DataBadge source={result.dataSource} />
                  {isAdmin && <span className="text-[11px] text-ink-faint">{result.model}</span>}
                </div>
                <span className="text-[11px] text-ink-faint">As of {new Date(result.generatedAt).toLocaleString()}</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink-dim">{result.analysis.summary}</p>
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
              <span className="font-medium text-amber-200">Biggest risk: </span>
              <span className="text-amber-100">{result.analysis.biggestRisk}</span>
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">{result.sourceLabel}</div>
          </div>

          {/* Allocation + diagnostics */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AllocationDonut
              slices={result.portfolio.positions.map((p) => ({ symbol: p.symbol, value: p.weightPct }))}
              title="Your allocation by holding"
            />
            <div className="rounded-xl glass p-4">
              <div className="text-sm font-semibold text-ink">Diagnostics</div>
              <div className="mt-1 text-xs text-ink-faint">
                Largest position {result.analysis.concentration.topPositionPct?.toFixed(0)}% · largest sector {result.analysis.concentration.topSectorPct?.toFixed(0)}%
              </div>
              <ul className="mt-3 space-y-2">
                {result.analysis.diagnostics?.map((d, i) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 ${SEV_CLS[d.severity] ?? SEV_CLS.watch}`}>
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="text-xs opacity-90">{d.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Sector exposure bars */}
          <div className="rounded-xl glass p-4">
            <div className="text-sm font-semibold text-ink">Sector exposure</div>
            <div className="mt-3 space-y-1.5">
              {result.portfolio.sectors.map((s) => (
                <div key={s.sector} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 truncate text-ink-dim">{s.sector}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                    <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, s.pct)}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right text-xs text-ink-dim">{s.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Horizon-based action plan */}
          <div className="rounded-xl glass p-4">
            <div className="text-sm font-semibold text-ink">Action plan by time horizon</div>
            <div className="mt-1 text-xs text-ink-faint">How long do you plan to hold? Pick a horizon — the doctor&apos;s buy/sell calls change with it.</div>

            {/* Horizon tabs */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.analysis.horizons?.map((h, i) => (
                <button key={h.horizon} onClick={() => setActiveHorizon(i)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    i === activeHorizon ? "tab-active" : "border-hairline text-ink-dim hover:bg-surface"
                  }`}>
                  {h.horizon}
                </button>
              ))}
            </div>

            {active && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-hairline bg-black/15 px-3 py-2 text-sm text-ink-dim">
                  <span className="font-medium text-ink">{active.horizon} stance: </span>{active.stance}
                </div>
                {/* Combined buy/sell plan as a table */}
                {(active.sells?.length || active.buys?.length) ? (
                  <div className="overflow-x-auto rounded-lg border border-hairline">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
                        <tr>
                          <th className="px-3 py-2">Ticker</th>
                          <th className="px-3 py-2">Action</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-right">Shares</th>
                          <th className="px-3 py-2">Why</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {[
                          ...(active.sells ?? []).map((m) => ({ m, kind: "sell" as const })),
                          ...(active.buys ?? []).map((m) => ({ m, kind: "buy" as const })),
                        ].map(({ m, kind }, i) => {
                          const isBuy = kind === "buy";
                          return (
                            <tr key={i} className="align-top hover:bg-surface">
                              <td className="px-3 py-2.5">
                                <Link href={`/research?symbol=${m.symbol}`} className="font-semibold text-brand-300 hover:underline">{m.symbol}</Link>
                                {m.isNew && <span className="ml-1 rounded bg-brand-500/15 px-1 text-[9px] text-brand-300">NEW</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${isBuy ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
                                  {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{m.action}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-ink">{money(m.amountUsd)}</td>
                              <td className="px-3 py-2.5 text-right text-ink-dim">{m.shares != null ? `≈ ${m.shares}` : "—"}</td>
                              <td className="px-3 py-2.5 text-ink-dim">{m.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-hairline bg-black/15 px-3 py-2 text-xs text-ink-faint">No specific moves at this horizon — hold steady.</div>
                )}
              </div>
            )}
          </div>

          {/* Per-holding research links */}
          <div className="rounded-xl glass p-4">
            <div className="text-sm font-semibold text-ink">Your holdings — research & predictions</div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
                  <tr>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Weight</th>
                    <th className="px-3 py-2">Today</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Sector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.portfolio.positions.map((p) => (
                    <tr key={p.symbol} className="hover:bg-surface">
                      <td className="px-3 py-2 font-semibold">
                        <Link href={`/research?symbol=${p.symbol}`} className="text-brand-300 hover:underline" title={`Research ${p.symbol}`}>{p.symbol}</Link>
                      </td>
                      <td className="px-3 py-2 text-ink-dim">{p.value != null ? money(p.value) : "—"}</td>
                      <td className="px-3 py-2 text-ink-dim">{p.weightPct.toFixed(1)}%</td>
                      <td className={`px-3 py-2 ${p.changePct == null ? "text-ink-faint" : p.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {p.changePct == null ? "—" : `${p.changePct >= 0 ? "+" : ""}${p.changePct.toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-2 text-ink-dim">{p.score != null ? `${Math.round(p.score)} ${p.scoreLabel ?? ""}` : "—"}</td>
                      <td className="px-3 py-2 text-ink-dim">{p.sector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-ink-faint">
            AI-generated portfolio analysis using live data + web search. Amounts are estimates, not instructions.
            Generated {new Date(result.generatedAt).toLocaleString()}. Research and educational analysis, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
