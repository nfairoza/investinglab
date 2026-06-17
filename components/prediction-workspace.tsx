"use client";

import { useState } from "react";
import { DataBadge } from "./data-state";
import { TickerInput } from "./ticker-input";
import type { DataSource } from "@/lib/providers/types";

interface Horizon {
  horizon: string;
  direction: "up" | "down" | "flat";
  confidence: number;
  reason: string;
}
interface Headline { title: string; takeaway: string; }
interface Prediction {
  summary: string;
  horizons: Horizon[];
  priceTargetRange: string;
  biggestRisk: string;
  whatWouldChangeMyMind: string;
  keyHeadlines: Headline[];
}
interface Result {
  symbol: string;
  prediction: Prediction;
  dataSource: DataSource;
  sourceLabel?: string;
  asOf: string | null;
  model: string;
  generatedAt: string;
}

const DIR_STYLE: Record<string, { cls: string; arrow: string; word: string }> = {
  up:   { cls: "text-emerald-400", arrow: "▲", word: "Up" },
  down: { cls: "text-rose-400",    arrow: "▼", word: "Down" },
  flat: { cls: "text-slate-400",   arrow: "▬", word: "Flat" },
};

export function PredictionWorkspace({ initial = "AAPL" }: { initial?: string }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(sym?: string) {
    const symbol = (sym ?? draft).trim().toUpperCase();
    if (!symbol || busy) return;
    setDraft(symbol);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
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
      </div>

      {busy && (
        <div className="rounded-xl glass p-5">
          <div className="h-4 w-48 animate-pulse rounded bg-slate-800" />
          <div className="mt-3 h-20 animate-pulse rounded bg-slate-800" />
          <p className="mt-3 text-xs text-slate-500">Claude is pulling live data and searching recent news…</p>
        </div>
      )}

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
            <h2 className="text-lg font-semibold text-slate-100">{result.symbol} — AI prediction</h2>
            <div className="flex items-center gap-2">
              <DataBadge source={result.dataSource} />
              <span className="text-[11px] text-slate-600">{result.model}</span>
            </div>
          </div>
          {result.sourceLabel && (
            <div className="text-xs text-slate-500">
              Source: <span className="text-slate-400">{result.sourceLabel}</span>
            </div>
          )}

          {/* Summary */}
          <div className="card-hover rounded-xl glass p-5">
            <p className="text-slate-300">{result.prediction.summary}</p>
          </div>

          {/* Horizons */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {result.prediction.horizons?.map((h) => {
              const d = DIR_STYLE[h.direction] ?? DIR_STYLE.flat;
              return (
                <div key={h.horizon} className="card-hover rounded-xl glass p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{h.horizon}</div>
                  <div className={`mt-1 text-lg font-bold ${d.cls}`}>{d.arrow} {d.word}</div>
                  <div className="mt-1 text-xs text-slate-400">Confidence: <span className="text-slate-200">{h.confidence}%</span></div>
                  {/* confidence bar */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
                    <div className={`h-full ${h.direction === "down" ? "bg-rose-500" : h.direction === "up" ? "bg-emerald-500" : "bg-slate-500"}`}
                      style={{ width: `${h.confidence}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{h.reason}</p>
                </div>
              );
            })}
          </div>

          {/* Price target + risk */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="card-hover rounded-xl glass p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Price target range</div>
              <div className="mt-1 text-slate-200">{result.prediction.priceTargetRange}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-wide text-amber-300/80">Biggest risk</div>
              <div className="mt-1 text-sm text-amber-100">{result.prediction.biggestRisk}</div>
            </div>
          </div>

          {/* What would change my mind */}
          <div className="card-hover rounded-xl glass p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">What would change this call</div>
            <p className="mt-1 text-sm text-slate-300">{result.prediction.whatWouldChangeMyMind}</p>
          </div>

          {/* Headlines from web search */}
          {result.prediction.keyHeadlines?.length > 0 && (
            <div className="card-hover rounded-xl glass p-4">
              <div className="mb-2 text-sm font-medium text-slate-200">Recent headlines Claude found</div>
              <ul className="space-y-2">
                {result.prediction.keyHeadlines.map((hl, i) => (
                  <li key={i} className="border-b border-white/5 pb-2 last:border-0">
                    <div className="text-sm text-slate-300">{hl.title}</div>
                    <div className="text-xs text-slate-500">{hl.takeaway}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-slate-600">
            AI-generated probabilistic opinion using live data + web search, not a guarantee.
            Generated {new Date(result.generatedAt).toLocaleString()}. Research and educational analysis, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
