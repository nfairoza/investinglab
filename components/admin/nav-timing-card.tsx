"use client";

import useSWR from "swr";
import { Gauge } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ErrorState } from "../data-state";
import { Skeleton, Card } from "../ui/primitives";
import type { RouteTiming } from "@/lib/percentile";

interface Resp { routes: RouteTiming[]; totalSamples: number }

// SMOOTH S5 — admin card: click→first-contentful-render p50/p95 per route, from
// sampled nav-timing beacons (last 7d). Green p50 under 100ms = the cache-first /
// prefetch fast path is working (hovered + revisited navigations).
const ms = (n: number) => `${Math.round(n)}ms`;
const tone = (p50: number) => (p50 < 100 ? "text-emerald-300" : p50 < 400 ? "text-amber-300" : "text-rose-300");

export function NavTimingCard() {
  const { data, error, isLoading, mutate } = useSWR<Resp>("/api/admin/nav-timing", fetchJson, { revalidateOnFocus: false });

  return (
    <Card icon={<Gauge size={16} className="text-brand-400" />} title="Nav timing (click → render)">
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !data || data.routes.length === 0 ? (
        <p className="text-sm text-ink-dim">No navigation samples yet. Move around the app and check back.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] uppercase tracking-wide text-ink-faint">
            <span>Route</span><span className="text-right">p50</span><span className="text-right">p95</span><span className="text-right">n</span>
          </div>
          {data.routes.slice(0, 12).map((r) => (
            <div key={r.route} className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 text-sm">
              <span className="truncate font-mono text-xs text-ink-dim">{r.route}</span>
              <span className={`text-right font-mono ${tone(r.p50)}`}>{ms(r.p50)}</span>
              <span className="text-right font-mono text-ink-dim">{ms(r.p95)}</span>
              <span className="text-right text-[11px] text-ink-faint">{r.count}</span>
            </div>
          ))}
          <p className="text-[11px] text-ink-faint">
            {data.totalSamples} samples (7d, ~25% sampled). p50 &lt;100ms = cache/prefetch fast path.
          </p>
        </div>
      )}
    </Card>
  );
}
