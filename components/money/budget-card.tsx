"use client";

import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { categoryStyle } from "@/lib/categories";

// H1 — the budget card. Progress bar + pace dot + state styling. Used on the
// Budgets tab (full) and, in `compact` form, as a row on the Money dashboard.
// State: under = neutral; approaching (≥80%) = amber; exceeded = gentle severity
// ("$46 over — 9 days left") — never a red-alarm, per house rules.

export interface BudgetRow {
  id: string;
  category: string;
  target: number;
  spent: number;       // month-to-date
  ratio: number;       // spent / target
  pace: "ahead" | "on" | "behind";
  projected: number;
  expectedByNow: number;
}

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PACE_LABEL = { ahead: "over pace", on: "on pace", behind: "under pace" } as const;

// Day-of-month remaining, for the exceeded subline. Kept here so the card is
// self-contained (the API already computes ratio/pace).
function daysLeftInMonth(): number {
  const d = new Date();
  const dim = new Date(d.getUTCFullYear(), d.getUTCMonth() + 1, 0).getUTCDate();
  return Math.max(0, dim - d.getUTCDate());
}

// State tokens — amber at approach, gentle rose at exceed, neutral otherwise.
function stateStyle(ratio: number): { bar: string; text: string; ring: string } {
  if (ratio >= 1) return { bar: "bg-rose-400/80", text: "text-rose-300", ring: "border-rose-500/30" };
  if (ratio >= 0.8) return { bar: "bg-amber-400/80", text: "text-amber-300", ring: "border-amber-500/30" };
  return { bar: "bg-emerald-400/70", text: "text-ink-dim", ring: "border-hairline" };
}

const PACE_DOT = { ahead: "text-amber-300", on: "text-ink-faint", behind: "text-emerald-300" } as const;

export function BudgetCard({
  b, compact = false, onEdit, onRemove,
}: {
  b: BudgetRow;
  compact?: boolean;
  onEdit?: (v: number) => void;
  onRemove?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const st = stateStyle(b.ratio);
  const { icon: Icon, color } = categoryStyle(b.category);
  const pct = Math.min(100, Math.round(b.ratio * 100));
  const remaining = b.target - b.spent;
  const over = b.spent - b.target;

  return (
    <div className={`rounded-xl border ${st.ring} bg-surface p-3`}>
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink" title={b.category}>{b.category}</div>
          <div className="text-[11px] text-ink-faint">{money(b.spent)} / {money(b.target)}</div>
        </div>
        {!compact && onEdit && (editing ? (
          <div className="flex items-center gap-1">
            <input autoFocus type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={String(b.target)}
              className="w-16 rounded border border-hairline bg-surface px-1 py-0.5 text-[11px] text-ink" />
            <button onClick={() => { const v = Number(val); if (v > 0) onEdit(v); setEditing(false); }} className="text-emerald-400"><Check size={14} /></button>
            <button onClick={() => setEditing(false)} className="text-ink-faint"><X size={14} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setVal(String(b.target)); setEditing(true); }} className="text-ink-faint hover:text-ink"><Pencil size={12} /></button>
            {onRemove && <button onClick={onRemove} aria-label="Remove budget" className="text-ink-faint hover:text-rose-300"><X size={13} /></button>}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className={`h-full rounded-full ${st.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>

      {/* Remaining / over + pace */}
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className={st.text}>
          {b.ratio >= 1
            ? `${money(over)} over — ${daysLeftInMonth()} day${daysLeftInMonth() === 1 ? "" : "s"} left`
            : `${money(remaining)} left`}
        </span>
        <span className={`inline-flex items-center gap-1 ${PACE_DOT[b.pace]}`}>● {PACE_LABEL[b.pace]}</span>
      </div>
    </div>
  );
}
