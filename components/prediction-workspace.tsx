"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { DataBadge } from "./data-state";
import { useIsAdmin } from "./use-is-admin";
import { TickerInput } from "./ticker-input";
import { MotionLoader } from "./motion-loader";
import type { DataSource } from "@/lib/providers/types";

interface Horizon {
  horizon: string;
  direction: "up" | "down" | "flat";
  confidence: number;
  reason: string;
}
interface Headline { title: string; takeaway: string; url?: string; source?: string; }
interface Prediction {
  summary: string;
  horizons: Horizon[];
  priceTargetRange: string;
  expectedMovePct?: { oneWeek?: number; oneMonth?: number; oneYear?: number };
  priceTarget?: number | null;
  biggestRisk: string;
  whatWouldChangeMyMind: string;
  keyHeadlines: Headline[];
}

// Map a horizon label to its expectedMovePct key.
function moveForHorizon(p: Prediction, horizon: string): number | undefined {
  const m = p.expectedMovePct;
  if (!m) return undefined;
  const h = horizon.toLowerCase();
  if (h.includes("week")) return m.oneWeek;
  if (h.includes("month")) return m.oneMonth;
  if (h.includes("year")) return m.oneYear;
  return undefined;
}
function fmtPct(n: number | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}
interface Result {
  symbol: string;
  prediction: Prediction;
  dataSource: DataSource;
  sourceLabel?: string;
  asOf: string | null;
  model: string;
  generatedAt: string;
  cached?: boolean;
}

// "3 minutes ago" style relative time for the cache indicator.
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

const DIR_STYLE: Record<string, { cls: string; arrow: string; word: string }> = {
  up:   { cls: "text-emerald-400", arrow: "▲", word: "Up" },
  down: { cls: "text-rose-400",    arrow: "▼", word: "Down" },
  flat: { cls: "text-ink-dim",   arrow: "▬", word: "Flat" },
};

export function PredictionWorkspace({ initial = "AMD" }: { initial?: string }) {
  const isAdmin = useIsAdmin();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  // Persisted so the last prediction survives navigation/reload until you re-run.
  const [result, setResult] = usePersistedState<Result | null>("predictions-result", null);
  const [error, setError] = useState<string | null>(null);

  async function run(sym?: string, refresh = false) {
    const symbol = (sym ?? draft).trim().toUpperCase();
    if (!symbol || busy) return;
    setDraft(symbol);
    setBusy(true);
    setError(null); // keep the previous result visible until the new one lands
    try {
      const r = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, refresh }),
      });
      const j = await r.json();
      if (!r.ok || j.error) {
        setError(j.message ?? "Prediction failed.");
        return;
      }
      setResult(j as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <TickerInput value={draft} onChange={setDraft} onSelect={(s) => run(s)}
          placeholder="Search ticker or company…" />
        <button onClick={() => run()} disabled={busy}
          className="btn-gold rounded-md px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Researching the web…" : "Predict"}
        </button>
        {/* Force-refresh is admin-only (token control). Users get the shared
            cached prediction, which refreshes on its own schedule. */}
        {result && !busy && isAdmin && (
          <button onClick={() => run(result.symbol, true)}
            title="Force a fresh prediction (ignores the shared cache)"
            className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-dim hover:bg-surface hover:text-ink">
            Refresh
          </button>
        )}
      </div>

      {busy && <MotionLoader page="predictions" height={210} />}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
          {error}{error.includes("Connectors") || error.includes("Claude") ? (
            <a href="/connectors" className="ml-1 underline">Open Connectors</a>
          ) : null}
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{result.symbol} — AI prediction</h2>
            <div className="flex items-center gap-2">
              {result.cached && result.generatedAt && (
                <span title="Shared market prediction, reused across users to save tokens. Refresh to regenerate."
                  className="rounded-full border border-hairline bg-surface/40 px-2 py-0.5 text-[10px] text-ink-faint">
                  cached · {timeAgo(result.generatedAt)}
                </span>
              )}
              <DataBadge source={result.dataSource} />
              <span className="text-[11px] text-ink-faint">{result.model}</span>
            </div>
          </div>
          {result.sourceLabel && (
            <div className="text-xs text-ink-faint">
              Source: <span className="text-ink-dim">{result.sourceLabel}</span>
            </div>
          )}

          {/* Summary */}
          <div className="card-hover rounded-xl glass p-5">
            <p className="text-ink-dim">{result.prediction.summary}</p>
          </div>

          {/* Horizons */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {result.prediction.horizons?.map((h) => {
              const d = DIR_STYLE[h.direction] ?? DIR_STYLE.flat;
              const move = fmtPct(moveForHorizon(result.prediction, h.horizon));
              return (
                <div key={h.horizon} className="card-hover rounded-xl glass p-4">
                  <div className="text-xs uppercase tracking-wide text-ink-faint">{h.horizon}</div>
                  <div className={`mt-1 flex items-baseline gap-2 text-lg font-bold ${d.cls}`}>
                    <span>{d.arrow} {d.word}</span>
                    {move && <span className="text-base font-semibold">{move}</span>}
                  </div>
                  {move && <div className="text-[11px] text-ink-faint">expected move (estimate)</div>}
                  <div className="mt-1 text-xs text-ink-dim">Confidence: <span className="text-ink">{h.confidence}%</span></div>
                  {/* confidence bar */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-surface-raised">
                    <div className={`h-full ${h.direction === "down" ? "bg-rose-500" : h.direction === "up" ? "bg-emerald-500" : "bg-surface"}`}
                      style={{ width: `${h.confidence}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-dim">{h.reason}</p>
                </div>
              );
            })}
          </div>

          {/* Price target + risk */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card-hover rounded-xl glass p-4">
              <div className="text-xs uppercase tracking-wide text-ink-faint">Price target (12-month)</div>
              {result.prediction.priceTarget != null && (
                <div className="mt-1 text-2xl font-bold text-brand-300">${result.prediction.priceTarget.toFixed(2)}</div>
              )}
              <div className="mt-1 text-sm text-ink-dim">{result.prediction.priceTargetRange}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-wide text-amber-300/80">Biggest risk</div>
              <div className="mt-1 text-sm text-amber-100">{result.prediction.biggestRisk}</div>
            </div>
          </div>

          {/* What would change my mind */}
          <div className="card-hover rounded-xl glass p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint">What would change this call</div>
            <p className="mt-1 text-sm text-ink-dim">{result.prediction.whatWouldChangeMyMind}</p>
          </div>

          {/* Recent headlines — REAL articles from the news provider (verified
              links), not AI-generated URLs. */}
          {result.prediction.keyHeadlines?.length > 0 && (
            <div className="card-hover rounded-xl glass p-4">
              <div className="mb-2 text-sm font-medium text-ink">Recent headlines</div>
              <ul className="space-y-2">
                {result.prediction.keyHeadlines.map((hl, i) => (
                  <li key={i} className="border-b border-hairline pb-2 last:border-0">
                    {hl.url ? (
                      <a href={hl.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-300 hover:underline">
                        {hl.title} ↗
                      </a>
                    ) : (
                      <div className="text-sm text-ink-dim">{hl.title}</div>
                    )}
                    {(hl as any).source && <span className="ml-1 text-[11px] text-ink-faint">· {(hl as any).source}</span>}
                    {hl.takeaway && <div className="text-xs text-ink-faint">{hl.takeaway}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-ink-faint">
            AI-generated probabilistic opinion using live data + web search, not a guarantee.
            Generated {new Date(result.generatedAt).toLocaleString()}. Research and educational analysis, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
