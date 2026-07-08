import { Skeleton } from "@/components/ui/primitives";

// Generic route-loading skeleton (PA-A5): a title bar + a KPI row + a card grid,
// so navigating to a heavy page swaps instantly to a themed placeholder instead
// of blocking on the server component. Uses the shimmer .skeleton via Skeleton.
export function PageLoading() {
  return (
    <div className="space-y-5 p-1" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
      </div>
    </div>
  );
}
