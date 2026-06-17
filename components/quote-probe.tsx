"use client";

import useSWR from "swr";
import { DataBadge, DataTimestamp } from "./data-state";
import type { DataResult, Quote } from "@/lib/providers/types";

// Fetcher always RESOLVES to a DataResult so the data-honesty UI renders even on
// a network failure (instead of throwing). A failed request becomes a normal
// "unavailable" result — we never invent a number.
async function fetchQuote(url: string): Promise<DataResult<Quote>> {
  try {
    const r = await fetch(url);
    return (await r.json()) as DataResult<Quote>;
  } catch {
    return {
      data: null,
      source: "unavailable",
      asOf: null,
      provider: "client",
      note: "request failed",
    };
  }
}

// Live quote with polling + manual refresh.
//   * refreshMs: poll cadence (default 60s). SWR auto-PAUSES polling when the tab
//     is hidden, and revalidates on window focus — so we don't hammer the API
//     (or the provider's rate limit) while you're not looking.
//   * keepPreviousData: the old value stays on screen during a refresh, so the
//     card doesn't flash a skeleton every poll — only the first load does.
//   * the manual "Refresh" button calls mutate() for an on-demand pull.
export function QuoteProbe({
  symbol,
  refreshMs = 60_000,
}: {
  symbol: string;
  refreshMs?: number;
}) {
  const { data, isLoading, isValidating, mutate } = useSWR<DataResult<Quote>>(
    `/api/quote?symbol=${symbol}`,
    fetchQuote,
    {
      refreshInterval: refreshMs,
      revalidateOnFocus: true,
      keepPreviousData: true,
      dedupingInterval: 10_000,
    },
  );

  const up = (data?.data?.changePct ?? 0) >= 0;
  // "updating…" only when we already have a value and a background refresh is in
  // flight — distinct from the very first load (isLoading).
  const refreshing = isValidating && !isLoading && Boolean(data);

  return (
    <div className="max-w-sm rounded-xl glass p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-100">{symbol}</span>
        <div className="flex items-center gap-2">
          {data && <DataBadge source={data.source} />}
          <button
            onClick={() => mutate()}
            disabled={isValidating}
            className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            aria-label={`Refresh ${symbol} quote`}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {isLoading && <div className="mt-3 h-7 w-28 animate-pulse rounded bg-slate-800" />}

      {!isLoading && data?.data && (
        <div className="mt-2">
          <div className="text-2xl font-semibold text-slate-100">
            ${data.data.price?.toFixed(2)}
          </div>
          <div className={up ? "text-emerald-400" : "text-rose-400"}>
            {up ? "▲" : "▼"} {data.data.change?.toFixed(2)} ({data.data.changePct?.toFixed(2)}%){" "}
            {up ? "up" : "down"}
          </div>
        </div>
      )}

      {!isLoading && !data?.data && (
        <div className="mt-3 text-sm text-rose-300">
          Live data unavailable{data?.note ? ` — ${data.note}` : ""}. Add a market-data API key
          to switch from demo to live.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {data && <DataTimestamp asOf={data.asOf} />}
        {refreshing && <span className="text-[11px] text-slate-600">updating…</span>}
      </div>
    </div>
  );
}
