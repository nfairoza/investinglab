"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { DataBadge } from "./data-state";
import type { DataResult } from "@/lib/providers/types";
import type { ResearchReport } from "@/lib/research/types";
import { freshness } from "@/lib/research/staleness";
import { RecommendationGauge } from "./charts/RecommendationGauge";
import { ScenarioRangeChart } from "./charts/ScenarioRangeChart";
import { RevenueEarningsChart } from "./charts/RevenueEarningsChart";
import { MarginChart } from "./charts/MarginChart";
import { MotionLoader } from "./motion-loader";

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

export function ResearchPanel({ symbol, autoRun = true }: { symbol: string; autoRun?: boolean }) {
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
  // "no_key" is the only state where auto-generating won't help — surface the
  // manual prompt then. Otherwise we auto-generate below.
  const noKey = Boolean(data?.note && /key|connector|settings/i.test(data.note));

  // Auto-generate the memo once per symbol when none is saved — no manual click
  // needed. Skipped if there's no AI key (manual prompt shown instead).
  const autoFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoRun) return;
    if (isLoading || busy) return;
    if (report) return;          // already have one
    if (noKey) return;           // can't — show prompt
    if (autoFor.current === symbol) return; // tried already this symbol
    autoFor.current = symbol;
    regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, isLoading, report, noKey, autoRun]);

  // Reset the auto-trigger guard when the symbol changes.
  useEffect(() => { autoFor.current = autoFor.current === symbol ? symbol : null; }, [symbol]);

  const generating = busy || (autoRun && !report && !noKey);

  return (
    <div className="rounded-xl glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{symbol} — AI deep-dive memo</h2>
            <p className="text-[11px] text-ink-faint">Full written analysis (A–P sections, scenarios, action table) — generated automatically. The quick call is the AI prediction at the top of the page.</p>
          </div>
          {/* While the memo is being written, show a "Researching" pill instead
              of the data badge (which would read "Unavailable" pre-generation). */}
          {generating && !report ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> Researching…
            </span>
          ) : (
            report && data && <DataBadge source={data.source} />
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-dim">
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
            disabled={generating}
            className="rounded-md bg-brand-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Refresh analysis"}
          </button>
        </div>
      </div>

      {/* Auto-generating (or manual generate) — show the motion loader. */}
      {generating && !report && (
        <div className="mt-4"><MotionLoader page="research" height={220} label="Writing the deep-dive memo — reading financials and recent news…" /></div>
      )}

      {/* Only when we truly can't generate (no AI key) do we show the prompt. */}
      {noKey && !report && !generating && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-200">
          {data?.note ?? "Add a Claude or Gemini API key to generate the memo."}{" "}
          <a href="/connectors" className="underline">Open Connectors</a>
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-5">
          {/* Recommendation gauge — rating, confidence, biggest risk. */}
          <RecommendationGauge
            rating={report.rating}
            confidence={report.confidence}
            biggestRisk={report.biggestRisk}
            oneLineThesis={report.oneLineThesis}
          />

          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-ink-faint">Analysis generated {fresh?.label}.</span>
            {fresh?.stale && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                Over 12h old — refresh?
              </span>
            )}
            {data?.note && <span className="text-ink-faint">{data.note}</span>}
          </div>

          {/* Sections A–P; toggle swaps pro/beginner. */}
          <div className="space-y-3 border-t border-hairline pt-3">
            {report.sections.map((s) => (
              <div key={s.id}>
                <div className="text-sm font-medium text-ink">
                  {s.id}. {s.title}
                </div>
                <p className="text-sm text-ink-dim">{beginner ? s.beginner : s.pro}</p>
              </div>
            ))}
          </div>

          {/* Scenario range chart — visual. */}
          {report.scenarios.length > 0 && (
            <div className="border-t border-hairline pt-3">
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
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 border-t border-hairline pt-3">
            <RevenueEarningsChart symbol={symbol} />
            <MarginChart symbol={symbol} />
          </div>

          {/* Required Action Table. */}
          <div className="border-t border-hairline pt-3">
            <div className="mb-2 text-sm font-medium text-ink">Action table</div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {ACTION_ROWS.map((row) => (
                <div key={row.key} className="flex justify-between gap-3 border-b border-hairline py-1 text-sm">
                  <span className="text-ink-faint">{row.label}</span>
                  <span className="text-right text-ink-dim">{report.actionTable[row.key] || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-[11px] text-ink-faint">
        Research and educational analysis, not financial advice.
      </p>
    </div>
  );
}
