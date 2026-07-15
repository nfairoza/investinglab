"use client";

import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ErrorState } from "../data-state";
import { Skeleton, Card } from "../ui/primitives";

interface Stat { calls: number; costUsd: number }
interface Bucket { calls: number; costUsd: number; byProvider: Record<string, Stat>; byFeature?: Record<string, Stat> }
interface Usage { day: Bucket; week: Bucket; cacheHitRate?: { day: number; week: number } }

const usd = (n: number) => `$${n.toFixed(2)}`;

// Admin AI cost card (P6.3): estimated spend + call counts for the last 24h and
// 7d, broken down by provider. Estimates use public list prices — indicative,
// not billing.
export function AiCostCard() {
  const { data, error, isLoading, mutate } = useSWR<Usage>("/api/admin/ai-usage", fetchJson, { revalidateOnFocus: false });

  return (
    <Card icon={<Sparkles size={16} className="text-brand-400" />} title="AI usage & cost">
      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <p className="text-sm text-ink-dim">No usage recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {([["Last 24h", data.day, data.cacheHitRate?.day], ["Last 7 days", data.week, data.cacheHitRate?.week]] as const).map(([label, b, hit]) => (
            <div key={label} className="rounded-xl border border-hairline bg-surface p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
                <span className="font-mono text-lg font-semibold text-ink">{usd(b.costUsd)}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
                <span>{b.calls} call{b.calls !== 1 ? "s" : ""}</span>
                {hit != null && hit > 0 && <span className="text-emerald-400">· {hit}% prompt-cache hit</span>}
              </div>
              {Object.entries(b.byProvider).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(b.byProvider).map(([prov, s]) => (
                    <span key={prov} className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-dim">
                      {prov}: {s.calls} · {usd(s.costUsd)}
                    </span>
                  ))}
                </div>
              )}
              {/* Per-feature spend (AIEFF4) — mirrors the /connectors per-feature FMP
                  strip so a token leak in one surface shows as a line item. */}
              {b.byFeature && Object.entries(b.byFeature).length > 0 && (
                <div className="mt-2 border-t border-hairline pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-faint">By feature</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(b.byFeature)
                      .sort((a, c) => c[1].costUsd - a[1].costUsd || c[1].calls - a[1].calls)
                      .map(([feat, s]) => (
                        <span key={feat} className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-dim">
                          {feat}: {s.calls} · {usd(s.costUsd)}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <p className="text-[11px] text-ink-faint">Estimated from public list prices — indicative, not billing. Gemini token counts are approximate.</p>
        </div>
      )}
    </Card>
  );
}
