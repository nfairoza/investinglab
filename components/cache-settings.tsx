"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

// Clears the server FMP response cache (and the browser SWR cache) so all live
// figures refetch immediately — handy when day-change drifts vs a broker before
// the 90s cache TTL expires.
export function CacheSettings() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/cache/clear", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Cache cleared (${j.cleared ?? 0} entries). Reloading fresh data…` : "Could not clear cache.");
      // Hard reload so every panel refetches from the now-empty cache.
      if (r.ok) setTimeout(() => window.location.reload(), 700);
    } catch {
      setMsg("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl glass p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Data cache</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-dim">
            Live prices are cached ~90 seconds to stay within API limits. If a figure (like day&apos;s change)
            looks slightly behind your broker, clear the cache to pull fresh numbers right now.
          </p>
        </div>
        <button onClick={clear} disabled={busy}
          className="btn-gold inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm disabled:opacity-50">
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
          {busy ? "Clearing…" : "Clear cache & refresh"}
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-ink-dim">{msg}</p>}
    </div>
  );
}
