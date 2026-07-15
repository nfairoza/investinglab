"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { X } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

// BILL B2.5 — trial countdown, shown ONLY in the final 5 days (a full-length
// countdown makes 30 days feel like a ticking bomb). Dismissible. Also renders a
// gentle grace-period banner on payment issues.
interface Me { billingEnabled?: boolean; inTrial?: boolean; trialDaysLeft?: number; gracePeriod?: boolean }

export function TrialBanner() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  const [dismissed, setDismissed] = useState(false);

  if (!me || me.billingEnabled === false || dismissed) return null;

  if (me.gracePeriod) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
        <span>Payment issue — update your card to keep Premium.</span>
        <PortalLink />
      </div>
    );
  }

  if (me.inTrial && (me.trialDaysLeft ?? 99) <= 5) {
    const d = me.trialDaysLeft ?? 0;
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-500/30 bg-brand-500/[0.05] px-3 py-2 text-xs text-ink-dim">
        <span><span className="text-ink">{d} day{d === 1 ? "" : "s"} left</span> in your trial — keep everything for $8/mo.</span>
        <div className="flex items-center gap-2">
          <Link href="/pricing" className="text-brand-300 hover:underline">See plans</Link>
          <button onClick={() => setDismissed(true)} className="text-ink-faint hover:text-ink"><X size={13} /></button>
        </div>
      </div>
    );
  }
  return null;
}

function PortalLink() {
  async function open() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
  }
  return <button onClick={open} className="shrink-0 rounded-md border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/10">Update card</button>;
}
