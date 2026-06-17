"use client";

import useSWR from "swr";
import Link from "next/link";
import type { Holding } from "@/lib/db";
import { DataBadge, DataTimestamp } from "./data-state";
import { ScoreCard } from "./score-card";
import { PriceHistoryChart } from "./charts/PriceHistoryChart";
import { PriceChart } from "./charts/PriceChart";
import { RevenueEarningsChart } from "./charts/RevenueEarningsChart";
import { MarginChart } from "./charts/MarginChart";
import { PriceZoneBar } from "./charts/PriceZoneBar";
import { RecommendationGauge } from "./charts/RecommendationGauge";
import { ScenarioRangeChart } from "./charts/ScenarioRangeChart";
import { CompanyProfileCard } from "./company-profile-card";
import { AnalystPanel } from "./analyst-panel";
import { DcfCard } from "./dcf-card";
import { InsiderFeed } from "./insider-feed";
import type { DataResult, Quote } from "@/lib/providers/types";
import type { StockScore } from "@/lib/scoring/score";
import type { ResearchReport } from "@/lib/research/types";
type DR<T> = DataResult<T>;
import { useState } from "react";
import { freshness } from "@/lib/research/staleness";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  return (await r.json()) as T;
}

const ACTION_ROWS: { key: keyof ResearchReport["actionTable"]; label: string }[] = [
  { key: "currentPrice", label: "Current price" },
  { key: "costBasis", label: "My cost basis" },
  { key: "gainLoss", label: "Gain / loss" },
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

export function HoldingDetail({ symbol }: { symbol: string }) {
  const { data: holdings = [] } = useSWR<Holding[]>("/api/holdings", (url: string) => fetch(url).then((r) => r.json()));
  const holding = holdings.find((h) => h.symbol === symbol);

  const { data: quoteResult } = useSWR<DataResult<Quote>>(
    `/api/quote?symbol=${symbol}`,
    (url) => getJson<DataResult<Quote>>(url),
    { refreshInterval: 60_000, keepPreviousData: true },
  );

  const { data: scoreResult } = useSWR<DR<StockScore>>(
    `/api/score?symbol=${symbol}`,
    (url) => getJson<DR<StockScore>>(url),
    { refreshInterval: 5 * 60_000, keepPreviousData: true },
  );

  const { data: researchResult, mutate: mutateResearch } = useSWR<DR<ResearchReport>>(
    `/api/research?symbol=${symbol}`,
    (url) => getJson<DR<ResearchReport>>(url),
    { revalidateOnFocus: false },
  );

  const [generating, setGenerating] = useState(false);
  const [beginner, setBeginner] = useState(true);

  async function generateAnalysis() {
    setGenerating(true);
    try {
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const fresh = (await r.json()) as DR<ResearchReport>;
      await mutateResearch(fresh, { revalidate: false });
    } finally {
      setGenerating(false);
    }
  }

  const quote = quoteResult?.data;
  const score = scoreResult?.data;
  const report = researchResult?.data;
  const fresh = report ? freshness(report.generatedAt) : null;

  // Computed holding stats
  const price = quote?.price ?? null;
  const cost = holding ? holding.avgCost * holding.shares : null;
  const value = price != null && holding ? price * holding.shares : null;
  const gain = value != null && cost != null ? value - cost : null;
  const gainPct = gain != null && cost && cost > 0 ? (gain / cost) * 100 : null;
  const up = (gain ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/holdings" className="text-sm text-slate-400 hover:text-slate-200">← Holdings</Link>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <h1 className="text-2xl font-semibold text-slate-100">{symbol}</h1>
          {quote?.name && <span className="text-slate-400">{quote.name}</span>}
          {quoteResult && <DataBadge source={quoteResult.source} />}
        </div>
      </div>

      {/* Quick stats for this holding */}
      {holding && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Current price" value={price != null ? `$${price.toFixed(2)}` : "—"} />
          <StatCard label="My avg cost" value={`$${holding.avgCost.toFixed(2)}`} />
          <StatCard
            label="Gain / loss"
            value={
              gain != null
                ? `${up ? "▲ up" : "▼ down"} $${Math.abs(gain).toFixed(0)} (${gainPct?.toFixed(1)}%)`
                : "—"
            }
            valueClass={gain == null ? "" : up ? "text-emerald-300" : "text-rose-300"}
          />
          <StatCard label="Position value" value={value != null ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"} />
        </div>
      )}

      {!holding && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          {symbol} is not in your holdings.{" "}
          <Link href="/holdings" className="underline">Add it in Holdings</Link> to track your position.
        </div>
      )}

      {/* Company overview */}
      <CompanyProfileCard symbol={symbol} />

      {/* Analyst + DCF side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalystPanel symbol={symbol} />
        <DcfCard symbol={symbol} />
      </div>

      {/* Score card */}
      <ScoreCard symbol={symbol} />

      {/* Price zone bar from score */}
      {score && (
        <PriceZoneBar
          currentPrice={price}
          entryZone={score.entryZone}
          stopLoss={score.stopLoss}
          addBelow={researchResult?.data?.actionTable.addBelow ?? null}
          trimAbove={researchResult?.data?.actionTable.trimAbove ?? null}
          sellInvalidation={researchResult?.data?.actionTable.sellInvalidation ?? null}
        />
      )}

      {/* Price chart (Robinhood-style) + moving averages */}
      <PriceChart symbol={symbol} />
      <PriceHistoryChart symbol={symbol} />

      {/* Insider transactions */}
      <InsiderFeed symbol={symbol} />

      {/* Financial charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueEarningsChart symbol={symbol} />
        <MarginChart symbol={symbol} />
      </div>

      {/* AI research section */}
      <div className="rounded-xl glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-100">{symbol} — Research memo</h2>
            {researchResult && <DataBadge source={researchResult.source} />}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-400">
              <input type="checkbox" checked={beginner} onChange={(e) => setBeginner(e.target.checked)} className="accent-brand-500" />
              Explain Like I&apos;m New
            </label>
            <button
              onClick={generateAnalysis}
              disabled={generating}
              className="rounded-md bg-brand-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {generating ? "Generating…" : report ? "Refresh analysis" : "Generate analysis"}
            </button>
          </div>
        </div>

        {!report && researchResult && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200">
            {researchResult.note ?? "No research yet — click Generate analysis."}
          </div>
        )}

        {report && (
          <div className="mt-4 space-y-5">
            <RecommendationGauge
              rating={report.rating}
              confidence={report.confidence}
              biggestRisk={report.biggestRisk}
              oneLineThesis={report.oneLineThesis}
            />

            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-slate-500">Generated {fresh?.label}.</span>
              {fresh?.stale && (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  Over 12h old — refresh?
                </span>
              )}
            </div>

            {/* Sections A–P */}
            <div className="space-y-3 border-t border-white/10 pt-3">
              {report.sections.map((s) => (
                <div key={s.id}>
                  <div className="text-sm font-medium text-slate-200">{s.id}. {s.title}</div>
                  <p className="text-sm text-slate-400">{beginner ? s.beginner : s.pro}</p>
                </div>
              ))}
            </div>

            {/* Scenario range chart */}
            {report.scenarios.length > 0 && (
              <div className="border-t border-white/10 pt-3">
                <ScenarioRangeChart scenarios={report.scenarios} currentPrice={price} />
              </div>
            )}

            {/* Action table — required by spec §12 */}
            <div className="border-t border-white/10 pt-3">
              <div className="mb-3 text-sm font-medium text-slate-200">Action table</div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {ACTION_ROWS.map((row) => (
                  <div key={row.key} className="flex justify-between gap-3 border-b border-white/5 py-1 text-sm">
                    <span className="text-slate-500">{row.label}</span>
                    <span className="text-right text-slate-300">{report.actionTable[row.key] || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {quoteResult && <DataTimestamp asOf={quoteResult.asOf} />}
      <p className="text-[11px] text-slate-600">Research and educational analysis, not financial advice.</p>
    </div>
  );
}

function StatCard({ label, value, valueClass = "text-slate-100" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl glass p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}
