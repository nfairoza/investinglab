import { Suspense } from "react";
import { CacheSettings } from "@/components/cache-settings";
import { EtradeConnector } from "@/components/etrade-connector";
import { PlaidConnect } from "@/components/plaid-connect";

export const metadata = { title: "Settings" };

export default function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Connect your brokerage and manage app preferences. Your profile and account
          live under the account menu (top-right) → Profile.
        </p>
      </div>

      {/* ── Banking (Plaid) ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Banks &amp; cash</h2>
          <p className="text-sm text-ink-dim">
            Link your bank accounts to track balances, spending, and investments — read-only, private to you.
          </p>
        </div>
        <PlaidConnect />
      </section>

      {/* ── Brokerage (per-user connections) ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Connect your brokerage</h2>
          <p className="text-sm text-ink-dim">
            Link your own E*TRADE to sync your real positions into Holdings.
            Connections are private to your account — read-only, never shared.
          </p>
        </div>
        <Suspense>
          <EtradeConnector />
        </Suspense>
        <p className="text-[11px] text-ink-faint">
          This app never places trades or modifies your account — broker access is read-only.
          Your broker tokens are stored only in your own account.
        </p>
      </section>

      {/* ── App preferences ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">App preferences</h2>
        <CacheSettings />
      </section>
    </div>
  );
}
