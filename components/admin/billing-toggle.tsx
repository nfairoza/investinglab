"use client";

import { useState } from "react";
import useSWR from "swr";
import { CreditCard } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

// BILL B0 — admin Billing master switch. Shows current state; turning ON runs a
// confirm dialog stating exactly what happens (one-time trial reconcile → every
// trial user gets a fresh full trial), then flips the flag.
export function BillingToggle() {
  const { data, mutate } = useSWR<{ billingOn: boolean }>("/api/admin/billing", fetchJson, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  const on = data?.billingOn ?? false;

  async function flip(next: boolean) {
    if (next && !confirm("Turn billing ON?\n\nThis makes plan gating live. All existing trial users get a FRESH full trial (their clock resets to now), so no one is 'expired'. New users' clocks run from signup. This runs once.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/billing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }) });
      const json = await res.json();
      if (json.reconciled) alert(`Billing ON. Reset trial clocks for ${json.reconciled} user(s).`);
      mutate();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink"><CreditCard size={16} className="text-brand-400" /> Billing</div>
      <p className="mt-1 text-sm text-ink-dim">
        Master switch for plan gating. While <span className="text-ink">OFF</span>, the whole product ships free — no Locked UI, no trial countdowns, /pricing shows a "Free during beta" banner.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? "bg-emerald-500/15 text-emerald-300" : "bg-surface-raised text-ink-faint"}`}>
          {on ? "Billing ON" : "Billing OFF (free beta)"}
        </span>
        <button onClick={() => flip(!on)} disabled={busy} className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface-raised hover:text-ink disabled:opacity-60">
          {busy ? "…" : on ? "Turn OFF" : "Turn ON"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">Deploy order: swap live Stripe keys + register the prod webhook, verify with one $1 test purchase + refund, THEN flip this on.</p>
    </div>
  );
}
