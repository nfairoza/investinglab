"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pencil, Check, X, Info } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useCountUp } from "@/lib/use-count-up";
import { useEntitlement } from "@/components/use-entitlement";

// MV1 — Safe-to-Spend hero. The daily number, its horizon subline, an inline
// buffer editor, an evidence expander, and the 30-day cash-flow calendar strip.
// All numbers come deterministic from /api/money/safe-to-spend — no AI.
interface CalMarker { date: string; bills: { merchant: string; amount: number }[]; income: { source: string; amount: number }[] }
interface STS {
  safeToSpend: number; liquidBalance: number; buffer: number;
  nextPayday: string | null; horizonEnd: string; irregularIncome: boolean;
  billsDueTotal: number; billsDue: { merchant: string; amount: number; nextExpected: string }[];
  daysUntilHorizon: number; calendar: CalMarker[]; defaultBuffer: number;
}

const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export function SafeToSpendHero() {
  const entitled = useEntitlement("safe_to_spend");
  const { data, isLoading, mutate } = useSWR<STS>("/api/money/safe-to-spend", fetchJson, { revalidateOnFocus: false });
  const [editing, setEditing] = useState(false);
  const [bufferInput, setBufferInput] = useState("");
  const [showWhy, setShowWhy] = useState(false);

  const val = data?.safeToSpend ?? 0;
  const animated = useCountUp(Math.abs(val));
  const negative = val < 0;

  if (!entitled) return null; // server also enforces; hide when not on plan
  if (isLoading || !data) return <div className="h-40 animate-pulse rounded-2xl bg-surface-raised" />;

  async function saveBuffer() {
    const b = Number(bufferInput);
    if (!Number.isFinite(b) || b < 0) { setEditing(false); return; }
    await fetch("/api/money/safe-to-spend", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ buffer: b }) });
    setEditing(false);
    mutate();
  }

  return (
    <div className={`rounded-2xl border p-5 ${negative ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-brand-500/25 bg-gradient-to-br from-brand-500/[0.08] to-transparent"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Safe to spend</div>
          <div className={`mt-1 font-display text-4xl font-bold tabular-nums ${negative ? "text-amber-300" : "text-ink"}`}>
            {negative ? "−" : ""}{fmt(animated)}
          </div>
          <p className="mt-1 text-sm text-ink-dim">
            {data.irregularIncome
              ? <>no regular payday detected — showing 30-day view · <span className="text-ink">{data.billsDue.length} bill{data.billsDue.length === 1 ? "" : "s"} totaling {fmt(data.billsDueTotal)}</span> due</>
              : <>until <span className="text-ink">{data.nextPayday ? fmtDay(data.nextPayday) : "next payday"}</span> · {data.billsDue.length} bill{data.billsDue.length === 1 ? "" : "s"} totaling {fmt(data.billsDueTotal)} due before then</>}
          </p>
          {negative && (
            <p className="mt-2 text-sm text-amber-200/90">
              Bills before {data.nextPayday ? fmtDay(data.nextPayday) : "your next income"} exceed your cash plus buffer. One concrete step: move a non-essential bill after payday, or trim the buffer temporarily.
            </p>
          )}
        </div>
        <button onClick={() => setShowWhy((v) => !v)} className="rounded-md p-1.5 text-ink-faint hover:bg-surface hover:text-ink" title="How this is computed"><Info size={16} /></button>
      </div>

      {/* Buffer editor */}
      <div className="mt-3 flex items-center gap-2 text-xs text-ink-dim">
        <span>Buffer kept aside:</span>
        {editing ? (
          <span className="inline-flex items-center gap-1">
            <input autoFocus type="number" inputMode="decimal" value={bufferInput} onChange={(e) => setBufferInput(e.target.value)}
              className="w-24 rounded border border-hairline bg-surface px-2 py-0.5 text-ink" placeholder={String(data.buffer)} />
            <button onClick={saveBuffer} className="rounded p-1 text-emerald-400 hover:bg-surface"><Check size={14} /></button>
            <button onClick={() => setEditing(false)} className="rounded p-1 text-ink-faint hover:bg-surface"><X size={14} /></button>
          </span>
        ) : (
          <button onClick={() => { setBufferInput(String(data.buffer)); setEditing(true); }} className="inline-flex items-center gap-1 text-ink hover:underline">
            {fmt(data.buffer)} <Pencil size={11} className="text-ink-faint" />
          </button>
        )}
      </div>

      {/* Cash-flow calendar strip */}
      <CalendarStrip calendar={data.calendar} horizonEnd={data.horizonEnd} nextPayday={data.nextPayday} />

      {/* Evidence expander */}
      {showWhy && (
        <div className="mt-3 rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-dim">
          <p><span className="text-ink">Liquid cash</span> {fmt(data.liquidBalance)} − <span className="text-ink">bills due</span> {fmt(data.billsDueTotal)} − <span className="text-ink">buffer</span> {fmt(data.buffer)} = <span className="text-ink">{fmt(data.safeToSpend)}</span>.</p>
          {data.billsDue.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {data.billsDue.map((b, i) => <li key={i}>{b.merchant} — {fmt(b.amount)} on {fmtDay(b.nextExpected)}</li>)}
            </ul>
          )}
          <p className="mt-2 text-ink-faint">{data.irregularIncome ? "Income cadence unclear, so this uses a rolling 30-day horizon." : `Horizon: next detected payday ${data.nextPayday ? fmtDay(data.nextPayday) : ""}.`} Recomputed on each sync — no AI.</p>
        </div>
      )}
    </div>
  );
}

// The horizontal 30-day band: bill dots (sized by amount) below the line, income
// markers above. Glanceable; tap/hover a dot for the detail.
function CalendarStrip({ calendar, horizonEnd, nextPayday }: { calendar: CalMarker[]; horizonEnd: string; nextPayday: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const start = Date.parse(today + "T00:00:00Z");
  const maxBill = Math.max(1, ...calendar.flatMap((c) => c.bills.map((b) => b.amount)));
  const pos = (d: string) => Math.min(100, Math.max(0, ((Date.parse(d + "T00:00:00Z") - start) / (30 * 86400000)) * 100));

  return (
    <div className="mt-3">
      <div className="relative h-14 rounded-lg border border-hairline bg-surface px-1">
        {/* baseline */}
        <div className="absolute left-1 right-1 top-1/2 h-px -translate-y-1/2 bg-hairline" />
        {/* payday marker line */}
        {nextPayday && (
          <div className="absolute top-1 bottom-1 w-px bg-emerald-500/50" style={{ left: `${pos(nextPayday)}%` }} title={`Payday ${nextPayday}`} />
        )}
        {calendar.map((c) => {
          const left = `${pos(c.date)}%`;
          return (
            <div key={c.date} className="absolute top-0 bottom-0" style={{ left }}>
              {c.income.map((inc, i) => (
                <span key={`i${i}`} className="absolute top-1 -translate-x-1/2 text-[10px] text-emerald-400" title={`${inc.source} +${fmt(inc.amount)} · ${fmtDay(c.date)}`}>▲</span>
              ))}
              {c.bills.map((b, i) => {
                const size = 4 + Math.round((b.amount / maxBill) * 6);
                return <span key={`b${i}`} className="absolute bottom-1 -translate-x-1/2 rounded-full bg-rose-400/80" style={{ width: size, height: size }} title={`${b.merchant} ${fmt(b.amount)} · ${fmtDay(c.date)}`} />;
              })}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint">
        <span>Today</span>
        <span>{fmtDay(horizonEnd)}</span>
      </div>
    </div>
  );
}
