"use client";

import { SWRConfig } from "swr";

// App-wide SWR defaults so data persists across navigation and revisits feel
// instant. The default cache is a module-level Map that lives for the browser
// session, so leaving a page and coming back shows the last data immediately
// while a quiet revalidation runs in the background.
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        // JSON GET fetcher — individual hooks can still pass their own.
        fetcher: (url: string) => fetch(url).then((r) => r.json()),
        // Don't refetch on every window/tab focus — it caused visible reloads.
        revalidateOnFocus: false,
        // Keep showing the previous data during a revalidation (no skeleton flash).
        keepPreviousData: true,
        // Collapse duplicate requests for the same key within 30s.
        dedupingInterval: 30_000,
        // Retry transient errors a couple times, but don't hammer.
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
