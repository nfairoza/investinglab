"use client";

import useSWR from "swr";
import { DataBadge, DataNote } from "./data-state";
import type { DataResult, AnalystData } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<AnalystData>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<AnalystData>;
}

export function AnalystPanel({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<AnalystData>>(
    `/api/analyst?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const a = data?.data;
  const total = a ? a.strongBuy + a.buy + a.hold + a.sell + a.strongSell : 0;

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{symbol} — Analyst consensus</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-0.5 text-xs text-ink-faint">
        Aggregated ratings from major investment banks. Not financial advice — analysts are often wrong.
      </p>

      {isLoading && <div className="mt-4 h-20 animate-pulse rounded bg-surface-raised" />}
      {!isLoading && !a && (
        <DataNote note={data?.note} fallback="Analyst data unavailable." className="mt-3 block text-sm text-ink-faint" />
      )}

      {a && (
        <div className="mt-4 space-y-4">
          {/* Price targets */}
          {a.priceTargetConsensus != null && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <Fact label="Consensus target" value={`$${a.priceTargetConsensus.toFixed(2)}`} highlight />
              <Fact label="Average target" value={a.priceTargetAvg != null ? `$${a.priceTargetAvg.toFixed(2)}` : "—"} />
              <Fact label="High target" value={a.priceTargetHigh != null ? `$${a.priceTargetHigh.toFixed(2)}` : "—"} />
              <Fact label="Low target" value={a.priceTargetLow != null ? `$${a.priceTargetLow.toFixed(2)}` : "—"} />
            </div>
          )}

          {/* Rating breakdown bar */}
          {total > 0 && (
            <div>
              <div className="mb-1 text-xs text-ink-faint">Rating breakdown ({total} analysts)</div>
              <div className="flex h-4 w-full overflow-hidden rounded-full gap-px">
                <Bar count={a.strongBuy} total={total} bg="var(--positive)" label="Strong buy" />
                <Bar count={a.buy} total={total} bg="color-mix(in oklab, var(--positive) 55%, var(--surface-solid))" label="Buy" />
                <Bar count={a.hold} total={total} bg="var(--hold-bar)" label="Hold" />
                <Bar count={a.sell} total={total} bg="#f59e0b" label="Sell" />
                <Bar count={a.strongSell} total={total} bg="var(--negative)" label="Strong sell" />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-faint">
                {a.strongBuy > 0 && <span><span style={{ color: "var(--positive)" }}>■</span> Strong buy: {a.strongBuy}</span>}
                {a.buy > 0 && <span><span style={{ color: "color-mix(in oklab, var(--positive) 55%, var(--surface-solid))" }}>■</span> Buy: {a.buy}</span>}
                {a.hold > 0 && <span><span style={{ color: "var(--hold-bar)" }}>■</span> Hold: {a.hold}</span>}
                {a.sell > 0 && <span><span style={{ color: "#f59e0b" }}>■</span> Sell: {a.sell}</span>}
                {a.strongSell > 0 && <span><span style={{ color: "var(--negative)" }}>■</span> Strong sell: {a.strongSell}</span>}
              </div>
            </div>
          )}

          {/* Latest grade */}
          {a.latestGrade && (
            <div className="rounded-lg border border-hairline bg-surface p-3 text-sm">
              <div className="text-xs text-ink-faint mb-1">Latest analyst action</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{a.latestGrade.firm}</span>
                <span className="rounded-md border border-hairline-strong px-2 py-0.5 text-xs text-ink-dim">
                  {a.latestGrade.action}
                </span>
                {a.latestGrade.fromGrade && (
                  <span className="text-ink-faint text-xs">{a.latestGrade.fromGrade} → <span className="text-ink">{a.latestGrade.toGrade}</span></span>
                )}
                <span className="text-xs text-ink-faint">{a.latestGrade.date}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-hairline py-1">
      <span className="text-ink-faint shrink-0">{label}</span>
      <span className={`text-right font-medium ${highlight ? "text-brand-300" : "text-ink-dim"}`}>{value}</span>
    </div>
  );
}

function Bar({ count, total, bg, label }: { count: number; total: number; bg: string; label: string }) {
  if (!count) return null;
  return (
    <div
      className="h-full"
      style={{ width: `${(count / total) * 100}%`, background: bg }}
      title={`${label}: ${count}`}
    />
  );
}
