"use client";

import useSWR from "swr";

// Lightweight admin-awareness for UI gating. The REAL enforcement lives in the
// server routes; this only decides what to SHOW (rescan buttons, raw error text,
// model names, "Unavailable" badges, etc.). Defaults to non-admin until known.
export function useIsAdmin(): boolean {
  const { data } = useSWR<{ isAdmin?: boolean }>(
    "/api/me",
    (u: string) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  return Boolean(data?.isAdmin);
}
