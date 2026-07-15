"use client";

import useSWR from "swr";
import { fetchJson } from "@/lib/fetch-json";

// BILL B2.5/B3 — the "manage your plan" strip on /settings/billing. Shows the
// current plan/trial state + a one-click Customer Portal button (cancel, update
// card, change plan — all handled by Stripe, not us).
interface Me { billingEnabled?: boolean; plan?: string; inTrial?: boolean; trialDaysLeft?: number; gracePeriod?: boolean }

export function ManageBilling() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  if (!me) return null;

  const label = me.billingEnabled === false ? "Free during beta — full access"
    : me.inTrial ? `Free trial — ${me.trialDaysLeft} day${me.trialDaysLeft === 1 ? "" : "s"} left`
    : me.plan === "premium" ? "Premium" : me.plan === "pro" ? "Pro" : "Free";

  async function portal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
    else alert("Billing portal isn't available yet.");
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <div className="text-xs uppercase tracking-wide text-ink-faint">Your plan</div>
      <div className="mt-1 font-display text-2xl font-bold text-ink">{label}</div>
      {me.gracePeriod && <p className="mt-1 text-xs text-amber-300">Payment issue — update your card to keep Premium.</p>}
      {me.billingEnabled !== false && me.plan !== "free" && !me.inTrial && (
        <button onClick={portal} className="mt-3 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-dim hover:bg-surface-raised hover:text-ink">
          Manage plan (cancel, update card)
        </button>
      )}
    </div>
  );
}
