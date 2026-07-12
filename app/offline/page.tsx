import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

// M1.1 — offline fallback. Served by the service worker when a navigation fails
// and the network is down. We deliberately show NOTHING financial rather than
// stale balances — honesty over a cached lie.
export default function Page() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)" }}>
        <WifiOff className="text-brand-400" size={26} />
      </div>
      <h1 className="mt-4 text-xl font-semibold text-ink">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-ink-dim">
        rukMoney needs a connection to show your live balances and prices. We&apos;re showing nothing
        rather than stale numbers — reconnect and pull to refresh.
      </p>
    </div>
  );
}
