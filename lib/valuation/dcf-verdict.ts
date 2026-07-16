// =============================================================================
// DCF verdict — pure, deterministic polarity + sanity gate for the DCF card.
//
// The verdict is ALWAYS derived from the price's perspective vs the model's
// intrinsic value:
//   price > dcf → the market pays MORE than the model says it's worth →
//                 "above fair value (potentially overvalued)" (red/amber)
//   price < dcf → "below fair value (potentially undervalued)" (green)
//
// The headline percentage is (price − dcf) / dcf — how far the price sits above
// or below the modeled fair value, labeled from the price's side.
//
// SANITY GATE: a DCF that diverges from the market price by more than 60%
// (|price − dcf| / price) is almost always a broken model, not a 1500% mispriced
// stock. For high-growth names the terminal-value assumptions blow up. In that
// case we REFUSE to render a confident colored verdict in either direction and
// show a muted reliability notice instead. Extreme model outputs must never wear
// a green "undervalued" or red "overvalued" badge.
// =============================================================================

export const DCF_DIVERGENCE_LIMIT = 60; // percent of price; above this → unreliable

export type DcfDirection = "above" | "below" | "equal";

export interface DcfVerdict {
  dcf: number;
  price: number;
  // (price − dcf) / dcf, signed percent. + = price above fair value (rich).
  pctFromFair: number;
  direction: DcfDirection;
  overvalued: boolean;   // direction === "above"
  undervalued: boolean;  // direction === "below"
  // |price − dcf| / price, percent. The gate metric — how far the model sits
  // from the market it's trying to value.
  divergencePct: number;
  unreliable: boolean;   // divergencePct > DCF_DIVERGENCE_LIMIT
  // Verdict line, e.g. "20.0% below fair value (potentially undervalued)".
  // Empty when unreliable (the notice replaces it) or inputs are unusable.
  label: string;
}

// Compute the DCF verdict. Returns null when either input is missing or
// non-positive (no honest comparison possible).
export function dcfVerdict(dcf: number | null | undefined, price: number | null | undefined): DcfVerdict | null {
  if (dcf == null || price == null || !Number.isFinite(dcf) || !Number.isFinite(price)) return null;
  if (dcf <= 0 || price <= 0) return null;

  const pctFromFair = ((price - dcf) / dcf) * 100;
  const divergencePct = (Math.abs(price - dcf) / price) * 100;
  const unreliable = divergencePct > DCF_DIVERGENCE_LIMIT;

  const direction: DcfDirection = price > dcf ? "above" : price < dcf ? "below" : "equal";
  const overvalued = direction === "above";
  const undervalued = direction === "below";

  let label = "";
  if (!unreliable && direction !== "equal") {
    const perspective = overvalued ? "above fair value (potentially overvalued)" : "below fair value (potentially undervalued)";
    label = `${Math.abs(pctFromFair).toFixed(1)}% ${perspective}`;
  } else if (!unreliable && direction === "equal") {
    label = "at fair value";
  }

  return { dcf, price, pctFromFair, direction, overvalued, undervalued, divergencePct, unreliable, label };
}
