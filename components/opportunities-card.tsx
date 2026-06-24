"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, RefreshCw, Landmark } from "lucide-react";
import { MotionLoader } from "./motion-loader";

interface Idea {
  ticker: string;
  action: "Buy" | "Add" | "Trim" | "Sell";
  dollarAmount: number;
  lane: "owned" | "new" | "reduce";
  thesis: string;
  risk: string;
  confidence: number;
  timeHorizon: string;
}
interface OppResult {
  marketSummary?: string;
  ideas?: Idea[];
  notes?: string;
  cash?: number;
  aiName?: string;
  model?: string;
  generatedAt?: string;
  mode?: "market" | "congress";
  congressUsed?: boolean;
}

type Mode = "market" | "congress";

const ACTION_STYLE: Record<string, string> = {
  Buy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Add: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  Trim: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Sell: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

// AI "deploy my cash" opportunities. Auto-runs on mount when the cached scan is
// missing/stale (>6h); otherwise shows the cached scan instantly. Manual refresh
// re-runs on demand.
export function OpportunitiesCard() {
  const [result, setResult] = useState<OppResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [mode, setMode] = useState<Mode>("market");
  const ranAuto = useRef(false);

  const qs = (m: Mode) => (m === "congress" ? "?congress=1" : "");

  async function run(m: Mode = mode) {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/opportunities${qs(m)}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setError(j.message ?? "Scan failed."); return; }
      setResult(j); setCached(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  // Load (or generate) the scan for a given mode. Used on mount and on toggle.
  async function load(m: Mode) {
    try {
      const j = await fetch(`/api/opportunities${qs(m)}`).then((r) => r.json());
      if (j.cached) { setResult(j); setCached(true); return; }
      if (j.data) { setResult(j.data); setCached(true); } else { setResult(null); }
      run(m); // generate fresh
    } catch {
      run(m);
    }
  }

  // On mount: load the default (market) mode.
  useEffect(() => {
    if (ranAuto.current) return;
    ranAuto.current = true;
    load("market");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(m: Mode) {
    if (m === mode) return;
    setMode(m);
    setResult(null);
    load(m);
  }

  const ideas = result?.ideas ?? [];

  return (
    <div className="rounded-xl glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={17} className="text-accent" />
          <h2 className="text-lg font-semibold text-ink">Where to put your cash</h2>
        </div>
        <div className="flex items-center gap-2">
          {result?.generatedAt && (
            <span className="text-[11px] text-ink-faint">
              {cached ? "Cached" : "Fresh"} · {new Date(result.generatedAt).toLocaleString()}
            </span>
          )}
          <button onClick={() => run()} disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Researching…" : "Re-scan"}
          </button>
        </div>
      </div>

      {/* Signal source toggle: Market vs Market + Congress */}
      <div className="mt-2 inline-flex items-center gap-0.5 rounded-lg border border-hairline bg-surface p-0.5">
        {([
          { k: "market", label: "Market", icon: TrendingUp },
          { k: "congress", label: "+ Congress", icon: Landmark },
        ] as const).map((t) => {
          const active = mode === t.k;
          return (
            <button key={t.k} onClick={() => switchMode(t.k)} disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${active ? "tab-active" : "text-ink-faint hover:text-ink-dim"}`}>
              <t.icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-xs text-ink-faint">
        {mode === "congress"
          ? "AI weighs recent congressional trading alongside the market scan against your cash, holdings, and watchlist. Disclosures lag — a sentiment signal, not advice."
          : "AI researches the market with your available cash, holdings, and watchlist — then suggests where to deploy it. Not financial advice."}
      </p>

      {busy && !result && <div className="mt-3"><MotionLoader page="predictions" height={200} label="Researching the market and your portfolio…" /></div>}

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          {error}{error.includes("Connectors") || error.includes("key") ? <a href="/connectors" className="ml-1 underline">Open Connectors</a> : null}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4">
          {result.marketSummary && (
            <div className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-dim">
              <span className="font-medium text-ink">Market now: </span>{result.marketSummary}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {ideas.map((idea, i) => {
              const isCut = idea.action === "Trim" || idea.action === "Sell";
              return (
                <div key={i} className="rounded-lg border border-hairline bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <a href={`/research?symbol=${idea.ticker}`} className="font-semibold text-brand-300 hover:underline">{idea.ticker}</a>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ACTION_STYLE[idea.action] ?? "border-hairline text-ink-dim"}`}>
                        {isCut ? <TrendingDown size={10} /> : <TrendingUp size={10} />}{idea.action}
                      </span>
                      {idea.lane === "new" && <span className="rounded bg-brand-500/15 px-1 text-[9px] text-brand-300">NEW IDEA</span>}
                    </div>
                    {idea.dollarAmount > 0 && <span className="font-mono text-sm text-ink">${idea.dollarAmount.toLocaleString()}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-dim">{idea.thesis}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
                    <span>Conf: <span className="text-ink-dim">{idea.confidence}%</span></span>
                    <span>{idea.timeHorizon}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300/80"><span className="font-medium">Risk:</span> {idea.risk}</p>
                </div>
              );
            })}
          </div>

          {result.notes && <p className="text-[11px] text-ink-faint">{result.notes}</p>}
          <p className="text-[11px] text-ink-faint">
            AI opinion using live data + web search — estimates, not guarantees. Buys assume ${result.cash?.toLocaleString() ?? "—"} cash. Research and educational analysis, not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
