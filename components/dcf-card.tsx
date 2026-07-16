"use client";

import useSWR from "swr";
import Link from "next/link";
import { DataBadge } from "./data-state";
import { dcfVerdict } from "@/lib/valuation/dcf-verdict";
import type { DataResult, DcfValue } from "@/lib/providers/types";

async function get(url: string): Promise<DataResult<DcfValue>> {
  const r = await fetch(url);
  return (await r.json()) as DataResult<DcfValue>;
}

export function DcfCard({ symbol }: { symbol: string }) {
  const { data, isLoading } = useSWR<DataResult<DcfValue>>(
    `/api/dcf?symbol=${symbol}`,
    get,
    { keepPreviousData: true },
  );

  const d = data?.data;
  // Single source of truth for polarity + the sanity gate. Price > DCF → the
  // market pays more than the model → overvalued (red); price < DCF → green.
  // A >60% divergence is treated as an unreliable model, not a real verdict.
  const verdict = dcfVerdict(d?.dcf, d?.price);

  // No DCF (e.g. ETFs/funds have no company cash flows to discount) — hide the
  // card entirely rather than showing an alarming "Unavailable". Rukmani can
  // explain why if asked. Only hide once the fetch has resolved with no data.
  if (!isLoading && !d) return null;

  return (
    <div className="card-hover rounded-xl glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{symbol} — DCF fair value</h2>
        {data && <DataBadge source={data.source} />}
      </div>
      <p className="mt-0.5 text-xs text-ink-faint">
        FMP's discounted cash flow model. One estimate — not a guarantee. Always use a range.
      </p>

      {isLoading && <div className="mt-4 h-16 animate-pulse rounded bg-surface-raised" />}

      {d && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs text-ink-faint">DCF intrinsic value</div>
              <div className="text-2xl font-bold text-ink">
                {d.dcf != null ? `$${d.dcf.toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-faint">Current price</div>
              <div className="text-xl font-semibold text-ink-dim">
                {d.price != null ? `$${d.price.toFixed(2)}` : "—"}
              </div>
            </div>
            {verdict && !verdict.unreliable && verdict.direction !== "equal" && (
              <div>
                <div className="text-xs text-ink-faint">vs fair value</div>
                <div className={`text-xl font-semibold ${verdict.undervalued ? "text-emerald-400" : "text-rose-400"}`}>
                  {verdict.undervalued ? "▼ " : "▲ "}{Math.abs(verdict.pctFromFair).toFixed(1)}%{" "}
                  <span className="text-sm font-normal">{verdict.undervalued ? "below fair value (potentially undervalued)" : "above fair value (potentially overvalued)"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Sanity gate: an extreme divergence between model and market is almost
              always a broken model, not a real mispricing. Replace the colored
              verdict with a muted reliability notice — no confident label. */}
          {verdict?.unreliable ? (
            <div className="rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-faint">
              DCF diverges from market price by {verdict.divergencePct.toFixed(0)}% — for high-growth companies this usually means the model&apos;s assumptions break down; treat as unreliable.{" "}
              <Link href="/glossary#dcf" className="text-brand-400 hover:underline">Why DCF has limits</Link>.
            </div>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/80">
              A DCF is only as good as its assumptions. Use this as one data point alongside valuation multiples, growth rate, and the AI memo — never in isolation.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
