"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { AiThinking } from "./ai-thinking";

// Compact AI-prediction widget for the top of the Research page. Research and
// Predictions go hand-in-hand: this gives a quick buy/sell + magnitude + horizon
// read using the SAME /api/predict endpoint, with a link to the full workspace.

interface Horizon {
  horizon: string;
  direction: "up" | "down" | "flat";
  confidence: number;
  reason: string;
}
interface Prediction {
  summary: string;
  horizons: Horizon[];
  priceTargetRange: string;
  priceTarget?: number | null;
  expectedMovePct?: { oneWeek?: number; oneMonth?: number; oneYear?: number };
  biggestRisk: string;
}
interface Result {
  symbol: string;
  prediction: Prediction;
  model: string;
}

const DIR: Record<string, { cls: string; chip: string; word: string; Icon: typeof TrendingUp }> = {
  up: { cls: "text-emerald-300", chip: "border-emerald-500/40 bg-emerald-500/10", word: "Lean Buy", Icon: TrendingUp },
  down: { cls: "text-rose-300", chip: "border-rose-500/40 bg-rose-500/10", word: "Lean Sell", Icon: TrendingDown },
  flat: { cls: "text-ink-dim", chip: "border-hairline-strong bg-surface/30", word: "Hold / Wait", Icon: Minus },
};

function fmtPct(n: number | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function MiniPrediction({ symbol, autoRun = false }: { symbol: string; autoRun?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reset when the researched symbol changes.
  if (symbol !== loadedFor && result) {
    setResult(null);
    setError(null);
  }

  async function run() {
    if (busy) return;
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
      if (!r.ok || j.error) { setError(j.message ?? "Prediction failed."); return; }
      setResult(j as Result);
      setLoadedFor(symbol);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  // Auto-run on mount / when the symbol changes (no manual click needed).
  const autoFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRun || !symbol) return;
    if (autoFor.current === symbol) return;
    autoFor.current = symbol;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, autoRun]);

  // Pick the headline horizon (1 month) as the quick read, fall back to first.
  const headline =
    result?.prediction.horizons?.find((h) => h.horizon.toLowerCase().includes("month")) ??
    result?.prediction.horizons?.[0];
  const d = headline ? DIR[headline.direction] ?? DIR.flat : null;
  const moves = result?.prediction.expectedMovePct;

  return (
    <div className="rounded-xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.07] to-transparent p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">AI prediction — {symbol}</span>
          <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-300">mini</span>
        </div>
        <a href={`/predictions?symbol=${symbol}`} className="flex items-center gap-1 text-xs text-brand-400 hover:underline">
          Full prediction <ArrowRight size={12} />
        </a>
      </div>

      {!result && !busy && !error && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs text-ink-faint">Get a quick AI buy/sell read with expected move and confidence — based on live data + web news.</p>
          <button onClick={run} className="btn-gold rounded-md px-3 py-1.5 text-xs">Predict {symbol}</button>
        </div>
      )}

      {busy && (
        <div className="mt-3">
          <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
          <AiThinking className="mt-2" />
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-rose-300">
          {error}{" "}
          {(error.includes("Connectors") || error.includes("Claude") || error.includes("key")) && (
            <a href="/connectors" className="underline">Open Connectors</a>
          )}
        </div>
      )}

      {result && headline && d && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold ${d.chip} ${d.cls}`}>
              <d.Icon size={15} /> {d.word}
            </span>
            <span className="text-xs text-ink-dim">
              over {headline.horizon} · confidence <span className="text-ink">{headline.confidence}%</span>
            </span>
            {result.prediction.priceTarget != null && (
              <span className="text-xs text-ink-dim">· 12-mo target <span className="text-brand-300">${result.prediction.priceTarget.toFixed(2)}</span></span>
            )}
          </div>

          {/* expected move per horizon */}
          {moves && (
            <div className="flex flex-wrap gap-3 text-xs">
              {[["1 wk", moves.oneWeek], ["1 mo", moves.oneMonth], ["1 yr", moves.oneYear]].map(([label, v]) => {
                const f = fmtPct(v as number | undefined);
                if (!f) return null;
                const up = (v as number) >= 0;
                return (
                  <span key={label as string} className="text-ink-faint">
                    {label}: <span className={up ? "text-emerald-400" : "text-rose-400"}>{f}</span>
                  </span>
                );
              })}
            </div>
          )}

          <p className="text-xs text-ink-dim">{headline.reason}</p>
          <p className="text-[11px] text-amber-200/70">Biggest risk: {result.prediction.biggestRisk}</p>
          <p className="text-[10px] text-ink-faint">AI estimate using live data + web search, not a guarantee. Not financial advice.</p>
        </div>
      )}
    </div>
  );
}
