import { WatchlistPage } from "@/components/watchlist-page";

export const metadata = { title: "Watchlist" };

export default function Page() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">Watchlist</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">
          Organize stocks into lists, follow trending lists, and set an ideal buy price to see when
          today&apos;s price is at or below your target.
        </p>
      </div>
      <WatchlistPage />
    </div>
  );
}
