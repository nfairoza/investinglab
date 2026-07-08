"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useAlertsBadge } from "./use-alerts-badge";

// Top-bar alerts entry (IA): a bell with the existing "something triggered" dot
// (useAlertsBadge). Alerts lost their primary nav slot in the 5-section IA — this
// keeps them one click away from anywhere. Links to the full /alerts page (manage
// all, add, AI suggestions). The badge clears when the user visits /alerts.
export function AlertsBell() {
  const hasNew = useAlertsBadge();
  return (
    <Link
      href="/alerts"
      aria-label={hasNew ? "Alerts — new triggers" : "Alerts"}
      title="Alerts"
      className="relative rounded-md p-2 text-ink-dim transition-colors hover:bg-surface hover:text-ink"
    >
      <Bell size={18} />
      {hasNew && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" aria-hidden />}
    </Link>
  );
}
