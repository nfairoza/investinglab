"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
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
interface Result {
  marketSummary?: string;
  ideas?: Idea[];
  notes?: string;
  cash?: number;
  aiName?: string;
  model?: string;
  generatedAt?: string;
}

const ACTION_STYLE: Record<string, string> = {
  Buy: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Add: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  Trim: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Sell: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};
const LANE_LABEL: Record<string, string> = { owned: "Holding", new: "New idea", reduce: "Reduce" };

// Whole-market + portfolio outlook: AI researches the market with your cash and
// positions, then lays out a buy/sell/trim plan as a detailed table. Reuses the
// /api/opportunities engine. Auto-runs on open (cache <6h), manual re-scan.
export function MarketOutlook() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const ran = useRef(false);

  async function run() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/opportunities", { method: "POST" });
      const j = await r.json();
      if (!r.ok || j.error) { setError(j.message ?? "Scan failed."); return; }
      setResult(j); setCached(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const j = await fetch("/api/opportunities").then((r) => r.json());
        if (j.cached) { setResult(j); setCached(true); return; }
        if (j.data) { setResult(j.data); setCached(true); }
        run();
      } catch { run(); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ideas = result?.ideas ?? [];
  const buys = ideas.filter((i) => i.action === "Buy" || i.action === "Add");
  const cuts = ideas.filter((i) => i.action === "Trim" || i.action === "Sell");
  const totalBuy = buys.reduce((s, i) => s + (i.dollarAmount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-lg font-semibold text-ink">Market &amp; portfolio outlook</h2>
        </div>
        <div className="flex items-center gap-2">
          {result?.generatedAt && <span className="text-[11px] text-ink-faint">{cached ? "Cached" : "Fresh"} · {new Date(result.generatedAt).toLocaleString()}</span>}
          <button onClick={run} disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-brand-500/50 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-50">
            <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> {busy ? "Researching…" : "Re-scan"}
          </button>
        </div>
      </div>

      {busy && !result && <MotionLoader page="predictions" height={240} label="Researching the market and your portfolio…" />}

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          {error}{error.includes("Connectors") || error.includes("key") ? <a href="/connectors" className="ml-1 underline">Open Connectors</a> : null}
        </div>
      )}

      {result && (
        <>
          {result.marketSummary && (
            <div className="rounded-xl glass p-4">
              <div className="text-xs uppercase tracking-wide text-ink-faint">Where the market is now</div>
              <p className="mt-1 text-sm text-ink-dim">{result.marketSummary}</p>
            </div>
          )}

          {/* Summary stat row */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Ideas" value={`${ideas.length}`} />
            <Stat label="To buy / add" value={`$${totalBuy.toLocaleString()}`} tone="emerald" />
            <Stat label="Cash available" value={`$${(result.cash ?? 0).toLocaleString()}`} />
          </div>

          {/* The plan as a table */}
          <div className="overflow-x-auto rounded-xl glass">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Why</th>
                  <th className="px-3 py-2">Risk</th>
                  <th className="px-3 py-2 text-right">Conf.</th>
                  <th className="px-3 py-2">Horizon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ideas.map((idea, i) => {
                  const isCut = idea.action === "Trim" || idea.action === "Sell";
                  return (
                    <tr key={i} className="align-top hover:bg-surface">
                      <td className="px-3 py-2.5">
                        <a href={`/predictions?symbol=${idea.ticker}`} className="font-semibold text-brand-300 hover:underline">{idea.ticker}</a>
                        {idea.lane && <div className="text-[10px] text-ink-faint">{LANE_LABEL[idea.lane] ?? idea.lane}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${ACTION_STYLE[idea.action] ?? "border-hairline text-ink-dim"}`}>
                          {isCut ? <TrendingDown size={10} /> : <TrendingUp size={10} />}{idea.action}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink">{idea.dollarAmount > 0 ? `$${idea.dollarAmount.toLocaleString()}` : "—"}</td>
                      <td className="px-3 py-2.5 text-ink-dim">{idea.thesis}</td>
                      <td className="px-3 py-2.5 text-amber-700 dark:text-amber-300/80">{idea.risk}</td>
                      <td className="px-3 py-2.5 text-right text-ink-dim">{idea.confidence}%</td>
                      <td className="px-3 py-2.5 text-ink-faint">{idea.timeHorizon}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {result.notes && <p className="text-[11px] text-ink-faint">{result.notes}</p>}
          <p className="text-[11px] text-ink-faint">
            AI opinion using live data + web search — estimates, not guarantees. Buys assume ${(result.cash ?? 0).toLocaleString()} cash.
            {result.aiName ? ` Generated by ${result.aiName}.` : ""} Research and educational analysis, not financial advice.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone === "emerald" ? "text-emerald-400" : "text-ink"}`}>{value}</div>
    </div>
  );
}
