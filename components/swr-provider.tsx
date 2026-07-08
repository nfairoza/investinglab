"use client";

import { SWRConfig } from "swr";
import { fetchJson } from "@/lib/fetch-json";

// App-wide SWR defaults so data persists across navigation and revisits feel
// instant. The default cache is a module-level Map that lives for the browser
// session, so leaving a page and coming back shows the last data immediately
// while a quiet revalidation runs in the background.
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        // Shared JSON GET fetcher that THROWS on non-2xx (PA-A5) so hooks that
        // don't pass their own fetcher still surface errors instead of parsing a
        // 404 body as data. Individual hooks can still override.
        fetcher: (url: string) => fetchJson(url),
        // Don't refetch on every window/tab focus — it caused visible reloads.
        revalidateOnFocus: false,
        // Keep showing the previous data during a revalidation (no skeleton flash).
        keepPreviousData: true,
        // Collapse duplicate requests for the same key within 15s.
        dedupingInterval: 15_000,
        // Retry transient errors a couple times, but don't hammer.
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
