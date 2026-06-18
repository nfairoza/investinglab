"use client";

import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult } from "@/lib/providers/types";
import type { StockScore, Horizon } from "@/lib/scoring/score";

async function getScore(url: string): Promise<DataResult<StockScore>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<StockScore>;
}

function tone(score: number): string {
  if (score >= 75) return "text-emerald-300";
  if (score >= 60) return "text-emerald-400";
  if (score >= 45) return "text-ink";
  if (score >= 30) return "text-amber-300";
  return "text-rose-300";
}
function barColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 45) return "bg-surface";
  if (score >= 30) return "bg-amber-500";
  return "bg-rose-500";
}

const HORIZON_LABELS: Record<Horizon, string> = { "1W": "1 week", "1M": "1 month", "1Y": "1 year", "5Y": "5 years" };

export function ScoreCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<StockScore>>(`/api/score?symbol=${symbol}`, getScore, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });
  const s = data?.data;

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">{symbol} — Score</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        A transparent, rules-based score from the data below — not an AI opinion.
      </p>

      {isLoading && <div className="mt-4 h-24 animate-pulse rounded bg-surface-raised" />}
      {!isLoading && !s && (
        <div className="mt-4 text-sm text-rose-300">Score unavailable{data?.note ? ` — ${data.note}` : ""}.</div>
      )}

      {!isLoading && s && (
        <div className="mt-4 space-y-4">
          <div className="flex items-baseline gap-3">
            <span className={`text-4xl font-bold ${tone(s.overall)}`}>{Math.round(s.overall)}</span>
            <span className="text-ink-dim">/ 100</span>
            <span className={`rounded-md border border-white/10 px-2 py-0.5 text-sm ${tone(s.overall)}`}>{s.label}</span>
          </div>

          {/* per-horizon */}
          <div className="space-y-2">
            {(Object.keys(HORIZON_LABELS) as Horizon[]).map((h) => {
              const v = s.horizons[h];
              return (
                <div key={h} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-ink-faint">{HORIZON_LABELS[h]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-surface-raised">
                    {v != null && <div className={`h-full ${barColor(v)}`} style={{ width: `${v}%` }} />}
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-ink-dim">{v != null ? Math.round(v) : "—"}</span>
                  {s.bestHorizon === h && <span className="text-[10px] text-emerald-400">best</span>}
                </div>
              );
            })}
          </div>

          {/* guides */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-white/10 pt-3 text-sm sm:grid-cols-2">
            <Row label="Best time horizon" value={s.bestHorizon ? HORIZON_LABELS[s.bestHorizon] : "—"} />
            <Row label="Earnings in" value={s.earningsInDays != null ? `${s.earningsInDays} days` : "—"} />
            <Row label="Entry zone (guide)" value={s.entryZone} />
            <Row label="Stop-loss (guide)" value={s.stopLoss} />
            <Row label="Major risk" value={s.majorRisk} />
          </div>

          {/* factor breakdown */}
          <div className="border-t border-white/10 pt-3">
            <div className="mb-2 text-sm font-medium text-ink">How the score breaks down</div>
            <div className="space-y-1.5">
              {s.factors.map((f) => (
                <div key={f.id} className="flex items-center gap-3 text-sm">
                  <span className="w-36 shrink-0 text-ink-dim">{f.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-raised">
                    {f.available && f.score != null && <div className={`h-full ${barColor(f.score)}`} style={{ width: `${f.score}%` }} />}
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-ink-faint">{f.available && f.score != null ? Math.round(f.score) : "—"}</span>
                  <span className="hidden w-64 shrink-0 truncate text-xs text-ink-faint md:block" title={f.detail}>{f.detail}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              Factors marked “—” need a data source that provides them (e.g. paid FMP / Alpaca).
            </p>
          </div>

          {data && <DataTimestamp asOf={data.asOf} />}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-faint">Research and educational analysis, not financial advice.</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1">
      <span className="text-ink-faint">{label}</span>
      <span className="text-right text-ink-dim">{value}</span>
    </div>
  );
}
