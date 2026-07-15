"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, ShieldCheck, Lock } from "lucide-react";
import { fetchJson } from "@/lib/fetch-json";

// BILL B2.5 — the pricing page, in the dark brand. Free + Premium cards with a
// Monthly/Annual toggle (annual default, "Save 20%" pill, monthly-anchored copy).
// While billing is off, buy buttons become a "Free during beta" banner.
interface Me { billingEnabled?: boolean; plan?: string; inTrial?: boolean; trialDaysLeft?: number }

const FREE_FEATURES = [
  "Manual portfolio + watchlists",
  "Rukmani chat (5/day, economy)",
  "Stock map, glossary, screeners (2 saves)",
  "Your data stays yours — always",
];
const PREMIUM_FEATURES = [
  "Everything in Free, plus:",
  "Link up to 5 banks (Plaid)",
  "Full Rukmani: memory, market brief, generous limits",
  "Insights Engine + weekly digest",
  "Power Trades: follows + push alerts",
  "Earnings, dividends, tax lens, benchmarks",
];

export function Pricing() {
  const { data: me } = useSWR<Me>("/api/me", fetchJson, { revalidateOnFocus: false });
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);

  const billingOff = me?.billingEnabled === false;

  async function checkout() {
    setBusy(true);
    try {
      const priceEnv = annual ? "STRIPE_PRICE_PREMIUM_YEARLY" : "STRIPE_PRICE_PREMIUM_MONTHLY";
      // The client can't read env price ids; the server validates against them.
      // We POST a symbolic interval and the checkout route maps it. (Kept simple:
      // the route accepts the resolved price id from a small /api/billing/prices.)
      const prices = await fetchJson<{ premiumMonthly?: string; premiumYearly?: string }>("/api/billing/prices");
      const priceId = annual ? prices.premiumYearly : prices.premiumMonthly;
      if (!priceId) { setBusy(false); return; }
      void priceEnv;
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ priceId }) });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-shimmer">Simple, honest pricing</h1>
        <p className="mt-1 text-sm text-ink-dim">Start with a full free trial — no card required. Cancel anytime.</p>
      </div>

      {billingOff && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-center text-sm text-emerald-300">
          Free during beta — you have full access. Pricing below is a preview.
        </div>
      )}

      {!billingOff && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setAnnual(false)} className={`rounded-md px-3 py-1.5 text-xs ${!annual ? "tab-active" : "border border-hairline text-ink-dim"}`}>Monthly</button>
          <button onClick={() => setAnnual(true)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${annual ? "tab-active" : "border border-hairline text-ink-dim"}`}>
            Annual <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">Save 20%</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlanCard name="Free" price="$0" sub="the brain, to try" features={FREE_FEATURES} cta={billingOff ? null : "Current"} onCta={() => {}} />
        <PlanCard
          name="Premium" highlighted
          price={annual ? "$8/mo" : "$12/mo"}
          sub={annual ? "billed annually as $96" : "billed monthly"}
          features={PREMIUM_FEATURES}
          cta={billingOff ? null : busy ? "…" : (me?.inTrial ? "Upgrade now" : "Start free trial")}
          onCta={checkout}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Cancel anytime</span>
        <span className="inline-flex items-center gap-1"><Lock size={12} /> Payments secured by Stripe</span>
        <span>Your data stays yours, even on free.</span>
      </div>
    </div>
  );
}

function PlanCard({ name, price, sub, features, cta, onCta, highlighted }: {
  name: string; price: string; sub: string; features: string[]; cta: string | null; onCta: () => void; highlighted?: boolean;
}) {
  return (
    <div className={`relative rounded-2xl border p-5 ${highlighted ? "border-brand-500/40 bg-brand-500/[0.04] shadow-[0_0_40px_-12px] shadow-brand-500/30" : "border-hairline bg-surface"}`}>
      {highlighted && <div className="absolute -top-2 right-4 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold text-black">Most popular</div>}
      <div className="text-sm font-semibold text-ink">{name}</div>
      <div className="mt-1 font-display text-3xl font-bold text-ink">{price}</div>
      <div className="text-xs text-ink-faint">{sub}</div>
      <ul className="mt-3 space-y-1.5 text-xs text-ink-dim">
        {features.map((f, i) => <li key={i} className="flex items-start gap-1.5"><Check size={13} className="mt-0.5 shrink-0 text-emerald-400" /> {f}</li>)}
      </ul>
      {cta && (
        <button onClick={onCta} disabled={cta === "Current"} className={`mt-4 w-full rounded-md px-3 py-2 text-sm ${highlighted ? "btn-gold" : "border border-hairline text-ink-dim"} disabled:opacity-60`}>{cta}</button>
      )}
    </div>
  );
}
