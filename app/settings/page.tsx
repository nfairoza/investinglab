import { Suspense } from "react";
import { CacheSettings } from "@/components/cache-settings";
import { EtradeConnector } from "@/components/etrade-connector";
import { PlaidConnect } from "@/components/plaid-connect";
import { getUserClient } from "@/lib/supabase-data";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // E*TRADE token sync is being retired for regular users in favor of Plaid;
  // keep it available for admins only for now.
  const ctx = await getUserClient();
  const isAdmin = Boolean(ctx?.isAdmin);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Connect your brokerage and manage app preferences. Your profile and account
          live under the account menu (top-right) → Profile.
        </p>
      </div>

      {/* ── Linked institutions (Plaid) ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Linked accounts</h2>
          <p className="text-sm text-ink-dim">
            Link banks, credit cards, brokerages, and retirement accounts to track balances,
            spending, and investments — read-only, private to you.
          </p>
        </div>
        <PlaidConnect />
      </section>

      {/* ── Brokerage (E*TRADE token sync) — ADMIN ONLY. Regular users connect
            brokerages through Plaid (Linked accounts) above. ── */}
      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Connect your brokerage <span className="ml-1 rounded-full border border-hairline px-2 py-0.5 align-middle text-[10px] font-medium text-ink-faint">Admin</span></h2>
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
      )}

      {/* ── App preferences ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">App preferences</h2>
        <CacheSettings />
      </section>
    </div>
  );
}
