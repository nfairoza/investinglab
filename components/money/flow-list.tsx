"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronDown } from "lucide-react";
import { toFlowList, merchantRowsFor, type SankeyGraph, type FlowRow } from "@/lib/money/sankey";
import { categoryStyle, categorySlug } from "@/lib/categories";
import { MerchantIcon } from "./merchant-icon";

// Mobile (<md) treatment of the Sankey: a ranked flow list. Income section then
// Expenses section, each row = icon + label + amount + % OF INCOME + a
// proportional accent-tinted background bar. Tap a category row to drill to its
// merchants (M0.2 card-row mechanics). Scope toggle: Category | Merchant.
// Percentages are always % of income — the meaningful anchor.

const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function FlowList({ graph }: { graph: SankeyGraph }) {
  const [scope, setScope] = useState<"category" | "merchant">("category");
  const list = toFlowList(graph, scope);

  return (
    <div className="space-y-4">
      {/* Scope segmented control */}
      <div className="flex overflow-hidden rounded-md border border-hairline text-xs">
        {(["category", "merchant"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} className={`flex-1 px-3 py-1.5 capitalize ${scope === s ? "tab-active" : "text-ink-dim hover:bg-surface"}`}>{s}</button>
        ))}
      </div>

      {/* Income */}
      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Income</h3>
          <span className="text-xs font-semibold text-ink">{money(list.totalIncome)}</span>
        </div>
        <div className="space-y-1">
          {list.income.map((r) => <Row key={r.id} row={r} accent="#34E0A1" />)}
          {list.income.length === 0 && <p className="text-xs text-ink-faint">No income detected in this period.</p>}
        </div>
      </section>

      {/* Savings summary */}
      {list.savings > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] px-3 py-2 text-sm">
          <span className="text-emerald-300">Saved</span>
          <span className="text-emerald-300"><span className="font-semibold">{money(list.savings)}</span> · {Math.round(list.savingsRate * 100)}% of income</span>
        </div>
      )}

      {/* Expenses */}
      <section>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Expenses</h3>
          <span className="text-xs font-semibold text-ink">{money(list.totalSpending)}</span>
        </div>
        <div className="space-y-1">
          {list.expenses.map((r) => (
            scope === "category"
              ? <CategoryRow key={r.id} row={r} graph={graph} />
              : <Row key={r.id} row={r} accent={categoryStyle(r.category ?? "Other").color} />
          ))}
          {list.expenses.length === 0 && <p className="text-xs text-ink-faint">No spending in this period.</p>}
        </div>
      </section>

      <p className="text-[11px] text-ink-faint">Percentages are share of income. Transfers and card payments are excluded — you see the spending, never the payment.</p>
    </div>
  );
}

// A leaf row: icon, label, amount, % of income, proportional accent bar behind it.
function Row({ row, accent, onClick, expandable, expanded }: {
  row: FlowRow; accent: string; onClick?: () => void; expandable?: boolean; expanded?: boolean;
}) {
  const w = Math.min(100, Math.max(2, row.pctOfIncome));
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button onClick={onClick} disabled={!onClick}
      className="relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-hairline px-3 py-2.5 text-left disabled:cursor-default">
      {/* proportional accent-tinted background bar */}
      <span className="absolute inset-y-0 left-0 -z-0" style={{ width: `${w}%`, background: `${accent}1f` }} aria-hidden />
      <span className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
        <MerchantIcon merchant={row.label} category={row.category ?? "Income"} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.label}</span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-medium text-ink">{money(row.amount)}</span>
          <span className="block text-[11px] text-ink-faint">{row.pctOfIncome}% of income</span>
        </span>
        {expandable && <Chevron size={15} className="shrink-0 text-ink-faint" />}
      </span>
    </button>
  );
}

// A category row that drills to its merchants + links to the category detail page.
function CategoryRow({ row, graph }: { row: FlowRow; graph: SankeyGraph }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const accent = categoryStyle(row.category ?? "Other").color;
  const merchants = open ? merchantRowsFor(graph, row.id) : [];
  const isRealCategory = !row.id.includes("__other");

  return (
    <div>
      <Row row={row} accent={accent} expandable expanded={open}
        onClick={() => isRealCategory ? setOpen((v) => !v) : undefined} />
      {open && (
        <div className="ml-6 mt-1 space-y-1 border-l border-hairline pl-3">
          {merchants.map((m) => <Row key={m.id} row={m} accent={accent} />)}
          {row.category && isRealCategory && (
            <button onClick={() => router.push(`/money/category/${categorySlug(row.category!)}`)}
              className="px-1 py-1 text-[11px] text-brand-300 hover:underline">Open {row.category} detail →</button>
          )}
        </div>
      )}
    </div>
  );
}
