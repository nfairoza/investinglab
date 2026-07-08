// Portfolio day-change aggregation, isolated + pure so it can be unit-tested and
// so a single bad quote can't silently poison the headline number.
//
// The failure mode this guards against: one holding's quote is internally
// inconsistent (e.g. a stale previous-close makes changePct read -40% when the
// stock barely moved, or a fallback quote where price/change/changePct disagree).
// Summed blindly, that one row can make a calm day read as a -6.7% crash — and
// that number then feeds every insight/digest downstream.
//
// Defense: prefer the absolute per-share `change` ($) for the dollar move, but
// cross-check it against price × changePct. If a holding is implausible or its
// three fields disagree beyond tolerance, it's flagged as a SUSPECT and excluded
// from the total (callers surface suspects to the error log, never to the user).

export interface DayChangeInput {
  symbol: string;
  shares: number;
  price: number | null;      // current price ($/share)
  change: number | null;     // day change ($/share), absolute
  changePct: number | null;  // day change (%)
  value?: number | null;     // market value if known (e.g. broker-provided)
}

export interface DayChangeSuspect {
  symbol: string;
  reason: string;
  changePct: number | null;
}

export interface DayChangeResult {
  dayChange: number;           // total $ change across trusted holdings
  dayChangePct: number | null; // vs total previous value
  currentValue: number;        // trusted current value
  prevValue: number;           // trusted previous-close value
  suspects: DayChangeSuspect[];
}

// A single stock moving more than this in one day is almost always a data error
// (wrong previous-close), not a real move. Deliberately generous so genuine
// large-cap gaps and volatile names still pass; crypto (which can legitimately
// swing more) is handled by the consistency check, not this bound.
const IMPLAUSIBLE_PCT = 45;

// price × changePct/100 should ≈ change. Allow 1% of price (or $0.02) of slack
// for rounding/timing differences between the fields.
function inconsistent(price: number, change: number, changePct: number): boolean {
  const implied = price * (changePct / 100);
  const tol = Math.max(0.02, price * 0.01);
  return Math.abs(implied - change) > tol;
}

export function computePortfolioDayChange(holdings: DayChangeInput[]): DayChangeResult {
  let dayChange = 0, currentValue = 0, prevValue = 0;
  const suspects: DayChangeSuspect[] = [];

  for (const h of holdings) {
    const shares = h.shares || 0;
    const price = h.price;
    const value = h.value ?? (price != null ? price * shares : null);
    if (value == null || value === 0) continue; // nothing to contribute

    const pct = h.changePct;
    const chg = h.change;

    // No day-change data at all → count the value, contribute $0 move (neutral).
    if (pct == null && chg == null) { currentValue += value; prevValue += value; continue; }

    // Implausible single-name move → suspect, exclude entirely.
    if (pct != null && Math.abs(pct) > IMPLAUSIBLE_PCT) {
      suspects.push({ symbol: h.symbol, reason: `changePct ${pct.toFixed(1)}% exceeds ${IMPLAUSIBLE_PCT}% (likely stale previous-close)`, changePct: pct });
      continue;
    }

    // Internally inconsistent price/change/changePct → suspect, exclude.
    if (price != null && chg != null && pct != null && price > 0 && inconsistent(price, chg, pct)) {
      suspects.push({ symbol: h.symbol, reason: `price×changePct (${(price * pct / 100).toFixed(2)}) disagrees with change (${chg.toFixed(2)})`, changePct: pct });
      continue;
    }

    // Trusted. Prefer the absolute per-share change; fall back to pct on value.
    // Per-share $ change is scale-invariant to any value override the caller gave.
    let moveDollars: number;
    if (chg != null && price != null) moveDollars = chg * shares;
    else if (pct != null) moveDollars = (pct / 100) * value;
    else moveDollars = 0;

    dayChange += moveDollars;
    currentValue += value;
    prevValue += value - moveDollars;
  }

  const dayChangePct = prevValue > 0 ? (dayChange / prevValue) * 100 : null;
  return { dayChange, dayChangePct, currentValue, prevValue, suspects };
}
