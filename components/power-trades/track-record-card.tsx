"use client";

import useSWR from "swr";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";

// PT3 — Track Record card. Reads the nightly-computed excess-vs-SPY stats for a
// person's disclosed buys. Honesty guards: n < 8 shows "insufficient history",
// never a percentage; the method is always one click away (docs/PT_METHOD.md).
interface WindowStat {
  window_days: number; n: number;
  mean_excess_pct: number | null; median_excess_pct: number | null; win_rate_pct: number | null;
  excesses: number[]; computed_at: string;
}

function pctCls(v: number | null): string {
  if (v == null) return "text-ink-faint";
  if (v > 0) return "text-emerald-300";
  if (v < 0) return "text-rose-300";
  return "text-ink-dim";
}
function fmt(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// A tiny distribution strip: one tick per trade, green above / red below zero.
function DistStrip({ excesses }: { excesses: number[] }) {
  if (!excesses.length) return null;
  const max = Math.max(1, ...excesses.map((e) => Math.abs(e)));
  return (
    <div className="mt-1 flex h-6 items-center gap-px" aria-hidden>
      {excesses.slice(0, 60).map((e, i) => {
        const h = Math.max(2, (Math.abs(e) / max) * 12);
        return <span key={i} className={`w-1 rounded-sm ${e >= 0 ? "bg-emerald-500/60" : "bg-rose-500/60"}`} style={{ height: h }} />;
      })}
    </div>
  );
}

export function TrackRecordCard({ name }: { name: string }) {
  const { data, isLoading } = useSWR<{ windows: WindowStat[] }>(
    `/api/power-trades/track-record?person=${encodeURIComponent(name)}`, fetchJson, { revalidateOnFocus: false },
  );
  const windows = data?.windows ?? [];
  if (isLoading || windows.length === 0) return null;

  const w90 = windows.find((w) => w.window_days === 90);
  const headline = w90 && w90.mean_excess_pct != null
    ? <>Disclosed buys beat SPY by <span className={pctCls(w90.mean_excess_pct)}>{fmt(w90.mean_excess_pct)}</span> over 90d <span className="text-ink-faint">({w90.n} trades, {w90.win_rate_pct != null ? `${Math.round(w90.win_rate_pct)}% win rate` : "—"})</span></>
    : <>Track record — <span className="text-ink-faint">insufficient history{w90 ? ` (${w90.n} trade${w90.n === 1 ? "" : "s"})` : ""}</span></>;

  return (
    <div className="mt-4 rounded-xl border border-hairline bg-surface p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Track record</div>
      <p className="mt-1 text-sm text-ink">{headline}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {windows.map((w) => (
          <div key={w.window_days} className="rounded-lg border border-hairline p-2">
            <div className="text-[10px] uppercase text-ink-faint">+{w.window_days}d excess</div>
            {w.mean_excess_pct != null ? (
              <>
                <div className={`text-sm font-semibold ${pctCls(w.mean_excess_pct)}`}>{fmt(w.mean_excess_pct)}</div>
                <div className="text-[10px] text-ink-faint">med {fmt(w.median_excess_pct)} · {w.n} trades · {w.win_rate_pct != null ? `${Math.round(w.win_rate_pct)}%` : "—"}</div>
                <DistStrip excesses={w.excesses} />
              </>
            ) : (
              <div className="text-[11px] text-ink-faint">insufficient history ({w.n})</div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-ink-faint">
        Excess return vs SPY, measured from the disclosure date; excludes options; equal-weighted.{" "}
        <Link href="/help#pt-method" className="text-brand-400 hover:underline">Method</Link>.
      </p>
    </div>
  );
}
