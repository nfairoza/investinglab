"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Search } from "lucide-react";

interface Txn {
  id: string; date: string; name: string; merchant: string | null;
  amount: number; currency: string; category: string; institution: string | null;
  pending: boolean; isTransfer: boolean; excluded: boolean;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number, c = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

// Common categories for the recategorize dropdown.
const CATEGORIES = [
  "Income", "Groceries", "Restaurants", "Coffee", "Shopping", "Transportation",
  "Travel", "Bills & Utilities", "Rent & Mortgage", "Health", "Entertainment",
  "Subscriptions", "Transfer", "Fees", "Other", "Uncategorized",
];

export function TransactionsView() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const { data, isLoading, mutate } = useSWR<{ transactions: Txn[]; configured?: boolean }>(
    "/api/plaid/transactions", fetchJson, { revalidateOnFocus: false },
  );

  const txns = data?.transactions ?? [];
  const categories = useMemo(() => Array.from(new Set(txns.map((t) => t.category))).sort(), [txns]);

  const filtered = txns.filter((t) => {
    if (category && t.category !== category) return false;
    if (q && !`${t.name} ${t.merchant ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  async function recategorize(t: Txn, newCat: string, applyToMerchant: boolean) {
    await fetch("/api/plaid/transactions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: t.id, category: newCat, merchant: t.merchant ?? t.name, applyToMerchant }),
    });
    mutate();
  }
  async function toggleFlag(t: Txn, field: "isTransfer" | "excluded") {
    await fetch("/api/plaid/transactions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: t.id, [field]: !t[field] }),
    });
    mutate();
  }

  if (data?.configured === false) {
    return <Empty>Bank connections aren&apos;t available yet.</Empty>;
  }
  if (!isLoading && txns.length === 0) {
    return <Empty>No transactions yet. <Link href="/settings" className="text-brand-400 underline">Connect a bank</Link> to see your spending here.</Empty>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-2">
          <Search size={15} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or description…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-hairline px-3 py-2 text-sm text-ink focus:outline-none"
          style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* List (cards on mobile, rows on desktop) */}
      <div className="space-y-1.5">
        {filtered.map((t) => (
          <div key={t.id} className={`rounded-xl border border-hairline bg-surface p-3 ${t.excluded ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{t.merchant ?? t.name}</div>
                <div className="text-[11px] text-ink-faint">
                  {t.date}{t.institution ? ` · ${t.institution}` : ""}{t.pending ? " · pending" : ""}
                </div>
              </div>
              <div className={`shrink-0 text-sm font-semibold ${t.amount < 0 ? "text-emerald-400" : "text-ink"}`}>
                {t.amount < 0 ? "+" : "-"}{money(Math.abs(t.amount), t.currency)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={t.category}
                onChange={(e) => recategorize(t, e.target.value, false)}
                className="rounded-md border border-hairline px-2 py-1 text-xs text-ink-dim focus:outline-none"
                style={{ background: "var(--surface-solid)", color: "var(--text)" }}>
                {[...new Set([t.category, ...CATEGORIES])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => recategorize(t, t.category, true)}
                title="Always categorize this merchant this way"
                className="rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-faint hover:bg-surface-raised hover:text-ink">
                Apply to merchant
              </button>
              <button onClick={() => toggleFlag(t, "isTransfer")}
                className={`rounded-md border px-2 py-1 text-[11px] ${t.isTransfer ? "border-brand-500/40 bg-brand-500/10 text-brand-300" : "border-hairline text-ink-faint hover:text-ink"}`}>
                Transfer
              </button>
              <button onClick={() => toggleFlag(t, "excluded")}
                className={`rounded-md border px-2 py-1 text-[11px] ${t.excluded ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-hairline text-ink-faint hover:text-ink"}`}>
                {t.excluded ? "Excluded" : "Exclude"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-hairline bg-surface p-6 text-center text-sm text-ink-dim">{children}</div>;
}
