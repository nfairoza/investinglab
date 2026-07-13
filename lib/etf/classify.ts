// ETF classification (E2) — pure, unit-tested. Detects leveraged/inverse funds
// and swap-based funds from the profile name + holdings, so the UI can show the
// right honest banner without an LLM. Deterministic math, no fabrication.

import type { EtfHolding } from "@/lib/providers/types";

export interface LeverageInfo {
  leveraged: boolean;
  factor: number;        // signed multiple: 3 (3x), -1 (inverse), 2 (2x); 1 if not leveraged
  inverse: boolean;
  label: string;         // human, e.g. "3× daily leveraged", "-1× inverse"
}

// Detect leverage from the fund name (issuers encode it there: "3X", "Ultra",
// "Bull/Bear", "Daily", "-1x"). Conservative — only flags clear signals.
export function detectLeverage(name: string | null | undefined): LeverageInfo {
  const n = (name ?? "").toLowerCase();
  const notLev: LeverageInfo = { leveraged: false, factor: 1, inverse: false, label: "" };
  if (!n) return notLev;

  const inverse = /\binverse\b|\bbear\b|\bshort\b|-1x|-2x|-3x|ultrashort|ultra short/.test(n);

  // Explicit multiple: "3x", "2x", "1.5x", "-3x".
  const mult = n.match(/(-?\d(?:\.\d)?)\s*x\b/);
  let magnitude = mult ? Math.abs(parseFloat(mult[1])) : 0;

  // Word cues when no explicit "Nx" appears.
  if (!magnitude) {
    if (/\bultrapro\b|\btriple\b|3x/.test(n)) magnitude = 3;
    else if (/\bultra\b|\bdouble\b|2x/.test(n)) magnitude = 2;
    else if (/\bbull\b|\bbear\b/.test(n) && /\bdaily\b/.test(n)) magnitude = 2; // Direxion-style daily bull/bear default
  }

  const leveraged = magnitude >= 2 || (inverse && magnitude >= 1);
  if (!leveraged && !inverse) return notLev;

  const factor = inverse ? -(magnitude || 1) : (magnitude || 1);
  const absLabel = Math.abs(factor);
  const label = inverse
    ? `${factor}× ${absLabel > 1 ? "leveraged inverse" : "inverse"}`
    : `${factor}× daily leveraged`;
  return { leveraged: leveraged || inverse, factor, inverse, label };
}

// A fund is "swap-based" when its reported holdings are dominated by swaps/cash/
// collateral rather than the stocks it tracks (SOXL, etc.). Threshold: <40% of
// weight is in real equities. Returns the non-equity share so the UI can be honest.
export function isSwapBased(holdings: EtfHolding[] | null | undefined): { swapBased: boolean; equityWeight: number } {
  if (!holdings || holdings.length === 0) return { swapBased: false, equityWeight: 0 };
  const total = holdings.reduce((s, h) => s + (h.weight || 0), 0);
  if (total <= 0) return { swapBased: false, equityWeight: 0 };
  const equityWeight = holdings.filter((h) => h.isEquity).reduce((s, h) => s + (h.weight || 0), 0) / total * 100;
  return { swapBased: equityWeight < 40, equityWeight };
}
