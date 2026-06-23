"use client";

import useSWR from "swr";
import { CreditCard } from "lucide-react";

interface Liability {
  kind: "credit" | "mortgage" | "student";
  institution: string | null;
  name: string;
  mask: string | null;
  balance: number | null;
  limit?: number | null;
  apr: number | null;
  nextPaymentDue: string | null;
  minPayment: number | null;
  currency: string;
}

const fetchJson = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number | null, c = "USD") => n == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);

const KIND_LABEL: Record<string, string> = { credit: "Credit card", mortgage: "Mortgage", student: "Student loan" };

// Debts from Plaid Liabilities: APR, balance, and next payment. Renders nothing
// when there are none (so the Accounts page stays clean for cash-only users).
export function LiabilitiesView() {
  const { data } = useSWR<{ liabilities: Liability[]; configured?: boolean }>("/api/plaid/liabilities", fetchJson, { revalidateOnFocus: false });
  const liabilities = data?.liabilities ?? [];
  if (!liabilities.length) return null;

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-3 flex items-center gap-2">
        <CreditCard size={16} className="text-rose-300" />
        <span className="font-medium text-ink">Debts &amp; loans</span>
      </div>
      <div className="space-y-2">
        {liabilities.map((l, i) => (
          <div key={i} className="rounded-xl border border-hairline bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {l.name}{l.mask ? <span className="text-ink-faint"> ••{l.mask}</span> : null}
                </div>
                <div className="text-[11px] text-ink-faint">
                  {KIND_LABEL[l.kind] ?? l.kind}{l.institution ? ` · ${l.institution}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-semibold text-rose-300">{money(l.balance, l.currency)}</div>
                {l.limit != null && <div className="text-[11px] text-ink-faint">of {money(l.limit, l.currency)}</div>}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
              {l.apr != null && <span>APR <span className="text-ink-dim">{l.apr.toFixed(2)}%</span></span>}
              {l.minPayment != null && <span>Min payment <span className="text-ink-dim">{money(l.minPayment, l.currency)}</span></span>}
              {l.nextPaymentDue && <span>Due <span className="text-ink-dim">{l.nextPaymentDue}</span></span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
