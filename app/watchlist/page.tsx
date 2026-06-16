import { WatchlistManager } from "@/components/watchlist-manager";

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Watchlist</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Track stocks you&apos;re considering. Set an ideal buy price and the app shows whether
          today&apos;s price is at or below your target.
        </p>
      </div>
      <WatchlistManager />
    </div>
  );
}
