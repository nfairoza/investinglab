"use client";

import { Landmark, ShieldCheck, Zap } from "lucide-react";
import { LinkButton } from "./plaid-connect";

// Shared, welcoming empty state that nudges a new user to CONNECT a financial
// institution via Plaid (instead of manual entry). Same look for the Invest
// (brokerage) and Money (bank) sections — only the copy differs.
export function ConnectEmptyState({
  variant,
  onLinked,
}: {
  variant: "invest" | "money";
  onLinked?: () => void;
}) {
  const copy = variant === "invest"
    ? {
        title: "Connect your brokerage to begin",
        sub: "Link your brokerage or retirement account and rukMoney pulls in your holdings, live values, gains, and allocation automatically.",
        button: "Connect brokerage",
        examples: "Robinhood, Fidelity, Schwab, E*TRADE, Vanguard, and more",
      }
    : {
        title: "Connect your bank to begin",
        sub: "Link your bank and cards and rukMoney shows balances, income vs. spending, and a full money checkup automatically.",
        button: "Connect bank",
        examples: "Chase, Bank of America, Wells Fargo, Amex, and more",
      };

  return (
    <div className="mx-auto max-w-xl rounded-2xl glass p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)" }}>
        <Landmark className="text-brand-400" size={26} />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-ink">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-dim">{copy.sub}</p>

      <div className="mt-5 flex justify-center">
        <LinkButton label={copy.button} onLinked={onLinked} />
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">{copy.examples}</p>

      <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-brand-400" /> Bank-level security via Plaid</span>
        <span className="inline-flex items-center gap-1"><Zap size={13} className="text-brand-400" /> Read-only — we can&apos;t move money</span>
      </div>
    </div>
  );
}
