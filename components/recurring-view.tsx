"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Repeat, TrendingUp, X } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";
import { ArtImage } from "./ui/art-image";

interface Charge {
  merchant: string; cadence: "monthly" | "annual"; avgAmount: number; lastAmount: number;
  lastSeen: string | null; status: string; priceIncrease: boolean;
}
const KEY = "/api/recurring";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

async function dismiss(merchant: string) {
  globalMutate(KEY, (cur: any) => cur ? { ...cur, recurring: cur.recurring.filter((c: Charge) => c.merchant !== merchant) } : cur, { revalidate: false });
  await fetch(KEY, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ merchant, status: "dismissed" }) }).catch(() => {});
  globalMutate(KEY);
}

// F6 — recurring / subscription view under Money.
export function RecurringView() {
  const { data, isLoading } = useSWR<{ recurring: Charge[]; monthlyTotal: number }>(KEY, fetchJson, { revalidateOnFocus: false });
  const active = (data?.recurring ?? []).filter((c) => c.status !== "dismissed");

  if (isLoading) return <div className="rounded-2xl glass p-6 text-sm text-ink-faint">Finding your subscriptions…</div>;

  if (active.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl glass p-8 text-center">
        <ArtImage name="empty-transactions" alt="" className="mx-auto mb-3 h-32 w-auto opacity-95" sizes="480px" />
        <h2 className="text-lg font-semibold text-ink">No recurring charges detected yet</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-dim">
          Once we see a few months of transactions, your subscriptions and recurring bills show up here —
          with a heads-up when one goes up in price.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass p-4">
        <div className="text-[10px] uppercase tracking-wide text-ink-faint">Recurring · per month</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-ink">{money(data!.monthlyTotal)}</div>
      </div>
      <div className="space-y-2">
        {active.map((c) => (
          <div key={c.merchant} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Repeat size={15} className="shrink-0 text-brand-400" />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{c.merchant}</div>
                <div className="text-xs text-ink-faint">
                  {c.cadence === "monthly" ? "Monthly" : "Annual"}{c.lastSeen ? ` · last ${c.lastSeen}` : ""}
                </div>
                {c.priceIncrease && (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-400">
                    <TrendingUp size={11} /> Went from {money(c.avgAmount)} to {money(c.lastAmount)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums font-medium text-ink">{money(c.lastAmount)}</span>
              <button onClick={() => dismiss(c.merchant)} title="Not recurring" className="text-ink-faint hover:text-ink"><X size={15} /></button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">Detected from your transaction history — merchants charged at a regular cadence with steady amounts. Dismiss any that aren&apos;t really subscriptions.</p>
    </div>
  );
}
