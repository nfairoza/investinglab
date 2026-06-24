"use client";

import { useState } from "react";
import useSWR from "swr";
import { Landmark, ChevronDown } from "lucide-react";

interface Account { account_id: string; name: string; mask: string | null; type: string; subtype: string | null; current: number | null; available: number | null; currency: string }
interface Item { itemId: string; institution: string; accounts: Account[] }
interface Balances { items: Item[]; configured?: boolean }

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

// Linked BROKERAGE / investment accounts (Plaid), shown in the Invest section.
// Banking accounts (cash/credit/loans) live in Money. Renders nothing when the
// user has no linked investment institutions.
export function BrokerageAccounts() {
  const { data } = useSWR<Balances>("/api/plaid/accounts", fetchJson, { revalidateOnFocus: false });

  const items = (data?.items ?? [])
    .map((it) => ({ ...it, accounts: it.accounts.filter((a) => a.type === "investment" || a.type === "brokerage") }))
    .filter((it) => it.accounts.length > 0);

  if (items.length === 0) return null;

  const total = items.reduce((s, it) => s + it.accounts.reduce((x, a) => x + (a.current ?? 0), 0), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink-dim">Linked brokerage & investment accounts</h2>
        <span className="text-xs text-ink-faint">{money(total)}</span>
      </div>
      <div className="space-y-2">
        {items.map((it) => <InstitutionCard key={it.itemId} item={it} />)}
      </div>
    </div>
  );
}

function InstitutionCard({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const total = item.accounts.reduce((s, a) => s + (a.current ?? 0), 0);
  const currency = item.accounts[0]?.currency ?? "USD";
  return (
    <div className="rounded-2xl glass">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left" aria-expanded={open}>
        <ChevronDown size={16} className={`shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
        <Landmark size={16} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{item.institution ?? "Brokerage"}</span>
          <span className="block text-[11px] text-ink-faint">{item.accounts.length} account{item.accounts.length !== 1 ? "s" : ""}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-ink">{money(total, currency)}</span>
      </button>
      {open && (
        <ul className="divide-y divide-hairline border-t border-hairline px-5 pb-1">
          {item.accounts.map((a) => (
            <li key={a.account_id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{a.name}{a.mask ? <span className="text-ink-faint"> ••{a.mask}</span> : null}</div>
                <div className="text-[11px] text-ink-faint">{a.subtype ?? a.type}</div>
              </div>
              <div className="text-sm font-semibold text-ink">{money(a.current, a.currency)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
