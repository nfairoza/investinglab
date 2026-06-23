"use client";

import { useEffect } from "react";
import useSWR from "swr";

// Keys written to localStorage that hold USER-SPECIFIC data and must never bleed
// across accounts on a shared browser. Add any new per-user cached key here.
const USER_SCOPED_KEYS = ["pf-doctor-result", "predictions-result"];

// localStorage key holding the identity of whoever the cached data belongs to.
const OWNER_KEY = "app-cache-owner";

function purgeUserScopedCache() {
  try {
    for (const k of USER_SCOPED_KEYS) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

// Mounted once in the app shell. Detects when the logged-in user changes (or signs
// out) on this browser and purges any user-specific cached state so one account
// never sees another account's cached results. This guards the client-side cache;
// server data is already isolated by Supabase RLS.
export function SessionScope() {
  const { data: me } = useSWR<{ authenticated?: boolean; email?: string | null }>(
    "/api/me",
    (u: string) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: true },
  );

  useEffect(() => {
    if (!me) return;
    const current = me.authenticated && me.email ? me.email : "__anon__";
    let prev: string | null = null;
    try { prev = localStorage.getItem(OWNER_KEY); } catch { /* ignore */ }

    if (prev !== current) {
      // Different account (or signed out) than the cache was written for → wipe it.
      purgeUserScopedCache();
      try { localStorage.setItem(OWNER_KEY, current); } catch { /* ignore */ }
      // Reload so any in-memory component state hydrated from the old cache is dropped.
      if (prev !== null) window.location.reload();
    }
  }, [me]);

  return null;
}
