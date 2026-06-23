import { EtradeConnector } from "@/components/etrade-connector";
import { RobinhoodConnector } from "@/components/robinhood-connector";
import { Suspense } from "react";

export const metadata = { title: "Connect brokerage" };

// Per-user brokerage connections. Every logged-in user connects their OWN
// E*TRADE / Robinhood here — tokens are stored in their own account and only
// their own positions sync into Holdings. No one sees anyone else's data.
export default function Page() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Connect your brokerage</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Link your own E*TRADE or Robinhood account to sync your real positions into Holdings.
          Connections are <span className="text-ink">private to your account</span> — read-only, and
          no one else can see your brokerage data.
        </p>
      </div>

      <section className="space-y-3">
        <Suspense>
          <EtradeConnector />
        </Suspense>
        <RobinhoodConnector />
      </section>

      <p className="text-[11px] text-ink-faint">
        This app never places trades or modifies your account — broker access is read-only. Your
        broker tokens are stored only in your own account and are never shared with other users.
      </p>
    </div>
  );
}
