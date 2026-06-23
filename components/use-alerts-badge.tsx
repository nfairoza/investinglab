"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import useSWR from "swr";

interface Alert { lastTriggeredAt?: string }

const SEEN_KEY = "alerts-last-seen";
const fetchJson = (u: string) => fetch(u).then((r) => r.json());

// Returns true when an alert has triggered since the user last opened the Alerts
// page — drives the red notification dot on the Alerts nav item. Clears itself
// once the user is on /alerts. (Alerts = your price/earnings triggers; the dot is
// the standard "something new happened" indicator, not a separate inbox.)
export function useAlertsBadge(): boolean {
  const path = usePathname() || "/";
  const { data: alerts } = useSWR<Alert[]>("/api/alerts", fetchJson, { refreshInterval: 60_000 });
  const [hasNew, setHasNew] = useState(false);

  // Most recent trigger time across all alerts.
  const latest = (alerts ?? [])
    .map((a) => (a.lastTriggeredAt ? new Date(a.lastTriggeredAt).getTime() : 0))
    .reduce((m, t) => Math.max(m, t), 0);

  useEffect(() => {
    if (!latest) { setHasNew(false); return; }
    let seen = 0;
    try { seen = Number(localStorage.getItem(SEEN_KEY) || 0); } catch { /* ignore */ }
    setHasNew(latest > seen);
  }, [latest]);

  // Visiting the Alerts page marks everything seen and clears the dot.
  useEffect(() => {
    if (path.startsWith("/alerts") && latest) {
      try { localStorage.setItem(SEEN_KEY, String(latest)); } catch { /* ignore */ }
      setHasNew(false);
    }
  }, [path, latest]);

  return hasNew;
}
