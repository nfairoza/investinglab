"use client";

import { useEffect, useState } from "react";
import { getMarketStatus, type MarketPhase } from "@/lib/market-status";

// Small live chip for the top bar: a colored dot + phase label (Market open /
// Pre-market / After hours / Market closed). Re-evaluates once a minute. Renders
// nothing until mounted so server/client markup can't mismatch on the clock.
const DOT: Record<MarketPhase, string> = {
  open: "#16D27E",   // green
  pre: "#F59E0B",    // amber
  after: "#0EA6C9",  // cyan
  closed: "#8B93A1", // grey
};

export function MarketStatusChip() {
  const [status, setStatus] = useState<ReturnType<typeof getMarketStatus> | null>(null);

  useEffect(() => {
    const tick = () => setStatus(getMarketStatus());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!status) return null;
  const color = DOT[status.phase];
  return (
    <span className="market-chip" title={`US equities · ${status.label}`}>
      <span
        className={`market-chip-dot${status.phase === "open" ? " market-chip-dot-live" : ""}`}
        style={{ background: color, color }}
        aria-hidden
      />
      <span className="market-chip-label">{status.label}</span>
    </span>
  );
}
