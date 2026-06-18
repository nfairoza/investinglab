import { WatchlistManager } from "@/components/watchlist-manager";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-[#ece9e0]">Watchlist</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Track stocks you&apos;re considering. Set an ideal buy price and the app shows whether
          today&apos;s price is at or below your target.
        </p>
      </div>
      <WatchlistManager />
    </div>
  );
}
