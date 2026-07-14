"use client";

import useSWR from "swr";
import Link from "next/link";
import { Target } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { useEntitlement } from "@/components/use-entitlement";

// MV3 — Home card for the nearest-dated goal. Compact; deep-links to /goals.
interface Goal {
  id: string; name: string; targetAmount: number; targetDate: string | null; currentAmount: number;
  projection: { projectedDate: string | null; extraNeeded: number | null; monthsEarlyOrLate: number | null; achieved: boolean };
}

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const monthLabel = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

export function GoalHomeCard() {
  const entitled = useEntitlement("money_goals");
  const { data } = useSWR<{ goals: Goal[] }>(entitled ? "/api/money/goals" : null, fetchJson, { revalidateOnFocus: false });
  if (!entitled) return null;
  const goals = (data?.goals ?? []).filter((g) => g.targetDate);
  if (goals.length === 0) return null;
  // Nearest target date first.
  const g = goals.sort((a, b) => String(a.targetDate).localeCompare(String(b.targetDate)))[0];
  const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
  const p = g.projection;

  return (
    <Link href="/goals" className="card-hover block rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Target size={15} className="text-brand-400" /> {g.name}</div>
        <span className="text-xs text-ink-faint">by {monthLabel(g.targetDate)}</span>
      </div>
      <div className="mt-2 text-xs text-ink-dim">{money(g.currentAmount)} of {money(g.targetAmount)} · {pct}%</div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
      <p className="mt-2 text-xs">
        {p.achieved ? <span className="text-emerald-300">Reached 🎉</span>
          : p.extraNeeded && p.extraNeeded > 0 ? <span className="text-ink-dim">on pace for {monthLabel(p.projectedDate)} · <span className="text-amber-300">+{money(p.extraNeeded)}/mo</span> closes the gap</span>
          : p.projectedDate ? <span className="text-emerald-300">on pace for {monthLabel(p.projectedDate)}</span>
          : <span className="text-ink-faint">set a saving rate to project</span>}
      </p>
    </Link>
  );
}
