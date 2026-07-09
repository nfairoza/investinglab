"use client";

import { useState } from "react";
import useSWR from "swr";
import { Info } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

type Period = "1M" | "3M" | "YTD" | "1Y";
interface Row { period: Period; portfolioPct: number | null; benchmarkPct: number | null }
interface BenchResp {
  available: boolean; note?: string;
  benchmarks?: { symbol: string; rows: Row[] }[];
  caveats?: Record<string, boolean>;
}

const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const tone = (n: number | null) => (n == null ? "text-ink-faint" : n >= 0 ? "text-emerald-400" : "text-rose-400");

// F5 — portfolio vs benchmark on the Portfolio header. YTD default (no
// cherry-picking). Honest: a period with a likely deposit/withdrawal shows a
// caveat tooltip; method limitation is spelled out.
export function BenchmarkHeader() {
  const [period, setPeriod] = useState<Period>("YTD");
  const { data } = useSWR<BenchResp>("/api/benchmark", fetchJson, { revalidateOnFocus: false });
  if (!data || !data.available || !data.benchmarks?.length) return null;

  const spy = data.benchmarks.find((b) => b.symbol === "SPY") ?? data.benchmarks[0];
  const row = spy.rows.find((r) => r.period === period);
  if (!row) return null;
  const caveat = data.caveats?.[period];

  return (
    <div className="rounded-2xl glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">You</div>
            <div className={`text-lg font-bold tabular-nums ${tone(row.portfolioPct)}`}>{fmtPct(row.portfolioPct)}</div>
          </div>
          <div className="text-ink-faint">vs</div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-ink-faint">S&amp;P 500</div>
            <div className={`text-lg font-bold tabular-nums ${tone(row.benchmarkPct)}`}>{fmtPct(row.benchmarkPct)}</div>
          </div>
          <span className="group relative inline-flex">
            <Info size={13} className="text-ink-faint" />
            <span className="pointer-events-none absolute left-1/2 top-6 z-10 hidden w-64 -translate-x-1/2 rounded-lg border border-hairline bg-surface-solid p-2 text-[11px] text-ink-dim shadow-lg group-hover:block">
              A time-weighted-return proxy from your monthly investment balances. It doesn&apos;t
              yet adjust for deposits/withdrawals{caveat ? " — and this window likely includes one, so treat it as directional." : "."} Not financial advice.
            </span>
          </span>
        </div>
        <div className="flex gap-1">
          {(["1M", "3M", "YTD", "1Y"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${p === period ? "tab-active" : "text-ink-faint hover:text-ink"}`}>{p}</button>
          ))}
        </div>
      </div>
      {caveat && <div className="mt-2 text-[11px] text-amber-400">This window may include a deposit or withdrawal, which can inflate the return.</div>}
    </div>
  );
}
