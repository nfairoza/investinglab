"use client";

import { useState } from "react";
import useSWR from "swr";
import { DataBadge } from "./data-state";
import type { DataResult } from "@/lib/providers/types";
import type { ResearchReport } from "@/lib/research/types";
import { freshness } from "@/lib/research/staleness";
import { RecommendationGauge } from "./charts/RecommendationGauge";
import { ScenarioRangeChart } from "./charts/ScenarioRangeChart";
import { RevenueEarningsChart } from "./charts/RevenueEarningsChart";
import { MarginChart } from "./charts/MarginChart";

async function getReport(url: string): Promise<DataResult<ResearchReport>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<ResearchReport>;
}

const ACTION_ROWS: { key: keyof ResearchReport["actionTable"]; label: string }[] = [
  { key: "currentPrice", label: "Current price" },
  { key: "costBasis", label: "My cost basis" },
  { key: "gainLoss", label: "Gain/loss" },
  { key: "fairValueRange", label: "Fair value range" },
  { key: "addBelow", label: "Add below" },
  { key: "trimAbove", label: "Trim above" },
  { key: "sellInvalidation", label: "Sell / invalidation" },
  { key: "upsidePotential", label: "Upside potential" },
  { key: "downsideRisk", label: "Downside risk" },
  { key: "riskReward", label: "Risk / reward" },
  { key: "finalAction", label: "Final action" },
  { key: "confidence", label: "Confidence" },
  { key: "mainReason", label: "Main reason" },
  { key: "biggestRisk", label: "Biggest risk" },
  { key: "nextCatalyst", label: "Next catalyst" },
  { key: "dataAsOf", label: "Data as of" },
];

export function ResearchPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, mutate } = useSWR<DataResult<ResearchReport>>(
    `/api/research?symbol=${symbol}`,
    getReport,
    { revalidateOnFocus: false },
  );
  const [busy, setBusy] = useState(false);
  const [beginner, setBeginner] = useState(true);

  async function regenerate() {
    setBusy(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const fresh = (await r.json()) as DataResult<ResearchReport>;
      await mutate(fresh, { revalidate: false });
    } finally {
      setBusy(false);
    }
  }

  const report = data?.data;
  const fresh = report ? freshness(report.generatedAt) : null;
  const unavailable = !report && !isLoading;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-100">{symbol} — Research memo</h2>
          {data && <DataBadge source={data.source} />}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <input
              type="checkbox"
              checked={beginner}
              onChange={(e) => setBeginner(e.target.checked)}
              className="accent-brand-500"
            />
            Explain Like I&apos;m New
          </label>
          <button
            onClick={regenerate}
            disabled={busy}
            className="rounded-md bg-brand-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {busy ? "Generating…" : report ? "Refresh analysis" : "Generate analysis"}
          </button>
        </div>
      </div>

      {isLoading && <div className="mt-4 h-20 animate-pulse rounded bg-slate-800" />}

      {unavailable && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          {data?.note ?? "No research yet."}{" "}
          {data?.note?.includes("Settings") && (
            <a href="/settings" className="underline">
              Open Settings
            </a>
          )}
        </div>
      )}

      {!isLoading && report && (
        <div className="mt-4 space-y-5">
          {/* Recommendation gauge — rating, confidence, biggest risk. */}
          <RecommendationGauge
            rating={report.rating}
            confidence={report.confidence}
            biggestRisk={report.biggestRisk}
            oneLineThesis={report.oneLineThesis}
          />

          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-slate-500">Analysis generated {fresh?.label}.</span>
            {fresh?.stale && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                Over 12h old — refresh?
              </span>
            )}
            {data?.note && <span className="text-slate-500">{data.note}</span>}
          </div>

          {/* Sections A–P; toggle swaps pro/beginner. */}
          <div className="space-y-3 border-t border-slate-800 pt-3">
            {report.sections.map((s) => (
              <div key={s.id}>
                <div className="text-sm font-medium text-slate-200">
                  {s.id}. {s.title}
                </div>
                <p className="text-sm text-slate-400">{beginner ? s.beginner : s.pro}</p>
              </div>
            ))}
          </div>

          {/* Scenario range chart — visual. */}
          {report.scenarios.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <ScenarioRangeChart
                scenarios={report.scenarios}
                currentPrice={
                  report.actionTable.currentPrice
                    ? parseFloat(report.actionTable.currentPrice.replace(/[^0-9.]/g, ""))
                    : null
                }
              />
            </div>
          )}

          {/* Financial charts. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 border-t border-slate-800 pt-3">
            <RevenueEarningsChart symbol={symbol} />
            <MarginChart symbol={symbol} />
          </div>

          {/* Required Action Table. */}
          <div className="border-t border-slate-800 pt-3">
            <div className="mb-2 text-sm font-medium text-slate-200">Action table</div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {ACTION_ROWS.map((row) => (
                <div key={row.key} className="flex justify-between gap-3 border-b border-slate-800/60 py-1 text-sm">
                  <span className="text-slate-500">{row.label}</span>
                  <span className="text-right text-slate-300">{report.actionTable[row.key] || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-600">
        Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
