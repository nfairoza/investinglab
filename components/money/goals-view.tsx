"use client";

import { useState } from "react";
import useSWR from "swr";
import { Target, Plus, Trash2, TrendingUp } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useEntitlement } from "@/components/use-entitlement";
import { ArtImage } from "@/components/ui/art-image";

// MV3 — Goals tab. Create savings goals; see deterministic cash-flow-only
// projections + the +$X/mo gap lever. No market-return assumptions.
interface Projection {
  remaining: number; monthlyFunding: number; monthsToGoal: number | null; projectedDate: string | null;
  onTrack: boolean | null; monthsEarlyOrLate: number | null; requiredMonthly: number | null; extraNeeded: number | null; achieved: boolean;
}
interface Goal {
  id: string; name: string; targetAmount: number; targetDate: string | null; linkedKind: string;
  currentAmount: number; investmentLinked: boolean; projection: Projection;
}

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthLabel = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

export function GoalsView() {
  const entitled = useEntitlement("money_goals");
  const { data, mutate } = useSWR<{ goals: Goal[]; monthlyFunding: number }>("/api/money/goals", fetchJson, { revalidateOnFocus: false });
  const [adding, setAdding] = useState(false);

  if (!entitled) return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">Goals are a Premium feature.</div>;
  const goals = data?.goals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-dim">Set a target and date; we project completion from your recent saving rate — cash-flow only, no market guesses.</p>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface hover:text-ink"><Plus size={13} /> New goal</button>
      </div>

      {adding && <GoalForm onSaved={() => { setAdding(false); mutate(); }} />}

      {goals.length === 0 && !adding && (
        <div className="rounded-2xl border border-hairline bg-surface p-8 text-center text-sm text-ink-dim">
          <ArtImage name="empty-follows" alt="" className="mx-auto mb-2 h-28 w-auto opacity-95" sizes="360px" />
          <p>No goals yet. Create one — an emergency fund, a trip, a down payment — and track honest progress toward it.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {goals.map((g) => <GoalCard key={g.id} g={g} onRemove={async () => { await fetch(`/api/money/goals?id=${g.id}`, { method: "DELETE" }); mutate(); }} />)}
      </div>
    </div>
  );
}

function GoalCard({ g, onRemove }: { g: Goal; onRemove: () => void }) {
  const p = g.projection;
  const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
  const lever = p.extraNeeded != null && p.extraNeeded > 0
    ? <>on pace for <span className="text-ink">{monthLabel(p.projectedDate)}</span>{p.monthsEarlyOrLate ? `, ${Math.abs(p.monthsEarlyOrLate)} mo ${p.monthsEarlyOrLate > 0 ? "late" : "early"}` : ""} · <span className="text-amber-300">+{money(p.extraNeeded)}/mo</span> closes the gap</>
    : p.achieved
      ? <span className="text-emerald-300">Goal reached 🎉</span>
      : p.projectedDate
        ? <>on pace for <span className="text-emerald-300">{monthLabel(p.projectedDate)}</span>{p.monthsEarlyOrLate != null && p.monthsEarlyOrLate < 0 ? `, ${Math.abs(p.monthsEarlyOrLate)} mo early` : ""}</>
        : <span className="text-ink-faint">add a monthly saving rate to project a date</span>;

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Target size={15} className="text-brand-400" /> {g.name}</div>
        <button onClick={onRemove} className="text-ink-faint hover:text-rose-300"><Trash2 size={13} /></button>
      </div>
      <div className="mt-2 text-xs text-ink-dim">{money(g.currentAmount)} of {money(g.targetAmount)}{g.targetDate ? ` · by ${monthLabel(g.targetDate)}` : ""}</div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs text-ink-dim"><TrendingUp size={12} className="text-ink-faint" /> {lever}</p>
      {g.investmentLinked && <p className="mt-1 text-[10px] text-ink-faint">Projected on contributions only — excludes market movement.</p>}
    </div>
  );
}

function GoalForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !(Number(amount) > 0)) return;
    setSaving(true);
    await fetch("/api/money/goals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), targetAmount: Number(amount), targetDate: date || null }) });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="rounded-2xl border border-brand-500/30 bg-brand-500/[0.04] p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="Target $" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint" />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink" style={{ colorScheme: "dark" }} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={save} disabled={saving} className="btn-gold rounded-md px-3 py-1.5 text-xs disabled:opacity-60">Create goal</button>
      </div>
    </div>
  );
}
