"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Wallet, Plus, X, ArrowRight } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { CATEGORY_GROUPS, categoryStyle } from "@/lib/categories";
import { BudgetCard, type BudgetRow } from "./budget-card";

// H1 — the Budgets tab body. Lists active budgets as cards + an "Add budget"
// flow: a grouped category picker (icons/accents from the canonical taxonomy)
// with the suggested amount (p50 of the trailing 3 months) pre-filled + editable.
// Monthly cycle, resets on the 1st, no rollover (v1). All numbers deterministic
// from /api/money/budgets.

interface Suggestion { category: string; p50: number; suggested: number; monthsUsed: number }
interface BudgetsResp { budgets: (BudgetRow & { suggestedFrom: number | null })[]; suggestions: Suggestion[]; month: string }

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function BudgetsView() {
  const { data, mutate } = useSWR<BudgetsResp>("/api/money/budgets", fetchJson, { revalidateOnFocus: false });
  const [adding, setAdding] = useState(false);

  const budgets = data?.budgets ?? [];
  const suggestions = data?.suggestions ?? [];
  const budgetedCats = new Set(budgets.map((b) => b.category));
  const suggestionByCat = new Map(suggestions.map((s) => [s.category, s]));

  async function save(category: string, monthlyAmount: number, suggestedFrom?: number) {
    await fetch("/api/money/budgets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, monthlyAmount, suggestedFrom }) });
    mutate();
  }
  async function remove(category: string) {
    await fetch(`/api/money/budgets?category=${encodeURIComponent(category)}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Wallet size={16} className="text-brand-400" /> Budgets</div>
        <button onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-xs text-ink-dim hover:bg-surface-raised hover:text-ink">
          {adding ? <><X size={12} /> Close</> : <><Plus size={12} /> Add budget</>}
        </button>
      </div>

      {budgets.length === 0 && !adding && (
        <p className="text-xs text-ink-faint">No budgets yet. A budget is suggested from your own typical spending — add one to track pace and month-end results. Budgets reset on the 1st; no rollover.</p>
      )}

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {budgets.map((b) => (
            <BudgetCard key={b.id} b={b} onEdit={(v) => save(b.category, v)} onRemove={() => remove(b.category)} />
          ))}
        </div>
      )}

      {adding && (
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <p className="text-xs text-ink-faint">Pick a category to budget. The amount is suggested from your median of the last 3 months where we have data — edit it to whatever fits.</p>
          <div className="mt-3 space-y-4">
            {CATEGORY_GROUPS.map((grp) => {
              const cats = grp.categories.filter((c) => !budgetedCats.has(c));
              if (!cats.length) return null;
              return (
                <div key={grp.group}>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{grp.group}</div>
                  <div className="space-y-1.5">
                    {cats.map((c) => (
                      <PickRow key={c} category={c} suggestion={suggestionByCat.get(c)} onAdd={(v, from) => { save(c, v, from); }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact dashboard block: the top few active budgets as rows + a link to the
// full Budgets tab. Self-hides when there are no budgets (nothing to nag about).
export function BudgetsSummary({ limit = 3 }: { limit?: number }) {
  const { data } = useSWR<BudgetsResp>("/api/money/budgets", fetchJson, { revalidateOnFocus: false });
  const budgets = data?.budgets ?? [];
  if (budgets.length === 0) return null;
  // Show the ones nearest/over their limit first (most worth a glance).
  const top = [...budgets].sort((a, b) => b.ratio - a.ratio).slice(0, limit);

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink"><Wallet size={16} className="text-brand-400" /> Budgets</div>
        <Link href="/money/budgets" className="inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink">All budgets <ArrowRight size={12} /></Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {top.map((b) => <BudgetCard key={b.id} b={b} compact />)}
      </div>
    </div>
  );
}

function PickRow({ category, suggestion, onAdd }: { category: string; suggestion?: Suggestion; onAdd: (v: number, from?: number) => void }) {
  const suggested = suggestion?.suggested ?? 0;
  const [val, setVal] = useState(suggested > 0 ? String(suggested) : "");
  const { icon: Icon, color } = categoryStyle(category);

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ backgroundColor: `${color}1f`, color }}><Icon size={13} /></span>
        <span className="truncate text-ink">{category}</span>
        {suggestion && <span className="shrink-0 text-ink-faint">typically {money(suggestion.p50)}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-ink-faint">$</span>
        <input type="number" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} placeholder={suggested > 0 ? String(suggested) : "0"}
          className="w-16 rounded border border-hairline bg-surface px-1 py-0.5 text-ink" />
        <button onClick={() => { const v = Number(val); if (v > 0) onAdd(v, suggestion?.p50); }} className="rounded-md bg-brand-500/15 px-2 py-1 text-brand-300 hover:bg-brand-500/25">Add</button>
      </div>
    </div>
  );
}
