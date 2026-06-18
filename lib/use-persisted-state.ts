"use client";

import { useEffect, useState } from "react";

// Like useState, but persisted to localStorage so results survive navigation /
// reload until explicitly overwritten. SSR-safe (reads only after mount).
export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);

  // Hydrate from storage once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    try {
      if (v == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(v));
    } catch { /* quota/availability — keep in-memory */ }
  };

  return [value, set];
}
