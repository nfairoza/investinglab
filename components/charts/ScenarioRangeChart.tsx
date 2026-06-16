"use client";

import type { Scenario } from "@/lib/research/types";

const COLORS: Record<string, string> = {
  Bull: "bg-emerald-500/70",
  Base: "bg-brand-600/70",
  Bear: "bg-amber-500/70",
  "Severe Downside": "bg-rose-600/70",
};

const BORDER: Record<string, string> = {
  Bull: "border-emerald-500/40",
  Base: "border-brand-500/40",
  Bear: "border-amber-500/40",
  "Severe Downside": "border-rose-500/40",
};

const TEXT: Record<string, string> = {
  Bull: "text-emerald-300",
  Base: "text-brand-300",
  Bear: "text-amber-300",
  "Severe Downside": "text-rose-300",
};

export function ScenarioRangeChart({
  scenarios,
  currentPrice,
}: {
  scenarios: Scenario[];
  currentPrice?: number | null;
}) {
  if (!scenarios.length) return null;

  const allPrices = scenarios.flatMap((s) =>
    [s.impliedPriceLow, s.impliedPriceHigh].filter((v): v is number => v != null),
  );
  if (currentPrice != null) allPrices.push(currentPrice);
  if (!allPrices.length) return null;

  const minP = Math.min(...allPrices) * 0.95;
  const maxP = Math.max(...allPrices) * 1.05;
  const range = maxP - minP;

  function pct(price: number) {
    return ((price - minP) / range) * 100;
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-sm font-semibold text-slate-100">Scenario price ranges</div>
      <div className="text-xs text-slate-500 mt-0.5">
        What could happen and how likely? Bull = best case, Severe Downside = worst case.
      </div>
      <div className="mt-5 space-y-3">
        {scenarios.map((s) => {
          const lo = s.impliedPriceLow;
          const hi = s.impliedPriceHigh;
          if (lo == null || hi == null) return null;
          const leftPct = pct(lo);
          const widthPct = pct(hi) - pct(lo);
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${TEXT[s.label] ?? "text-slate-300"}`}>{s.label}</span>
                <span className="text-slate-400">
                  ${lo.toFixed(0)}–${hi.toFixed(0)}
                  {s.probabilityPct != null && <span className="ml-2 text-slate-500">{s.probabilityPct}%</span>}
                  {s.expectedReturnPct != null && (
                    <span className={`ml-2 ${s.expectedReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.expectedReturnPct >= 0 ? "▲" : "▼"} {Math.abs(s.expectedReturnPct).toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="relative h-4 rounded bg-slate-800">
                <div
                  className={`absolute top-0 h-full rounded ${COLORS[s.label] ?? "bg-slate-500/70"}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
                {currentPrice != null && (
                  <div
                    className="absolute top-0 h-full w-0.5 bg-white/60"
                    style={{ left: `${pct(currentPrice)}%` }}
                    title={`Current: $${currentPrice.toFixed(2)}`}
                  />
                )}
              </div>
              <p className="text-[11px] text-slate-600 truncate">{s.assumptions}</p>
            </div>
          );
        })}
      </div>
      {currentPrice != null && (
        <div className="mt-3 text-xs text-slate-500">
          White bar = current price (${currentPrice.toFixed(2)})
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-600">
        These are scenario estimates, not predictions. Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
