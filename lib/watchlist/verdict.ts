// AIEFF1 — live verdict recompute for watchlist enrichment.
//
// The AI analysis (fair-value range, ideal buy, bull/bear, catalyst) is expensive
// "thinking" and is cached globally per symbol for the day. But any conclusion that
// compares to price — "below your ideal entry", the Buy/Wait action — is
// price-sensitive and must NEVER be served from cache: it is re-derived here
// against the LIVE quote every time the analysis is read. Pure + unit-tested.

export interface EnrichAnalysis {
  idealBuy?: number;
  fairValue?: string;   // human range, e.g. "$180–$210" (or "$180-$210", "180 to 210")
  bullCase?: string;
  bearCase?: string;
  catalyst?: string;
  note?: string;
  aiAction?: string;    // the AI's original action — may be stale vs the current price
}

export type VerdictAction = "Buy now" | "Start small" | "Wait" | "Avoid";
export type VsFairValue = "below" | "within" | "above";

export interface LiveVerdict {
  action: VerdictAction;
  // One-line, price-truthful summary shown next to the live price.
  line: string;
  atOrBelowIdeal: boolean | null;   // null when no ideal buy is known
  vsFairValue: VsFairValue | null;  // null when the range can't be parsed
}

// Pull the low/high numbers out of a human fair-value string. Tolerates the en-dash
// "–", hyphen "-", "to", currency symbols, and thousands separators. Returns null
// if we can't find two sensible numbers (so callers fall back to ideal-buy only).
export function parseFairValueRange(fv?: string | null): { low: number; high: number } | null {
  if (!fv) return null;
  const nums = (fv.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((n) => Number(n.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length < 2) return null;
  const low = Math.min(nums[0], nums[1]);
  const high = Math.max(nums[0], nums[1]);
  if (low === high) return null;
  return { low, high };
}

// Re-derive the action + verdict line from the cached analysis and the CURRENT
// live price. This is the price-sensitive half of the enrichment — never cached.
export function deriveVerdict(analysis: EnrichAnalysis, price: number | null | undefined): LiveVerdict {
  const range = parseFairValueRange(analysis.fairValue);
  const ideal = typeof analysis.idealBuy === "number" && analysis.idealBuy > 0 ? analysis.idealBuy : null;

  // No live price → we cannot honestly state a price-relative verdict. Fall back to
  // the AI's original action label (clearly not a live judgment) and say so.
  if (price == null || !Number.isFinite(price) || price <= 0) {
    const action = normalizeAction(analysis.aiAction);
    return { action, line: "Live price unavailable — verdict not current.", atOrBelowIdeal: null, vsFairValue: null };
  }

  const atOrBelowIdeal = ideal != null ? price <= ideal : null;
  const vsFairValue: VsFairValue | null = range
    ? price < range.low ? "below" : price > range.high ? "above" : "within"
    : null;

  // Decision, most-conservative signal wins:
  //  - price above fair value  → Avoid (overvalued vs the cached range)
  //  - at/below ideal buy      → Buy now (the entry the analysis wanted)
  //  - below fair-value low    → Start small (cheap-ish but no explicit ideal hit)
  //  - within fair value       → Wait (fairly priced; wait for a pullback)
  //  - else                    → Wait
  let action: VerdictAction;
  let line: string;
  if (vsFairValue === "above") {
    action = "Avoid";
    line = "above fair value — rich here";
  } else if (atOrBelowIdeal === true) {
    action = "Buy now";
    line = "at or below your ideal entry";
  } else if (vsFairValue === "below") {
    action = "Start small";
    line = "below the fair-value range";
  } else if (vsFairValue === "within") {
    action = "Wait";
    line = atOrBelowIdeal === false ? "above your ideal entry, inside fair value" : "inside fair value — wait for a pullback";
  } else if (atOrBelowIdeal === false) {
    action = "Wait";
    line = "above your ideal entry";
  } else {
    action = "Wait";
    line = "no live entry signal";
  }

  return { action, line, atOrBelowIdeal, vsFairValue };
}

// Coerce an arbitrary AI action string into our four canonical labels.
function normalizeAction(a?: string): VerdictAction {
  const s = (a ?? "").toLowerCase();
  if (s.includes("buy")) return "Buy now";
  if (s.includes("start") || s.includes("small") || s.includes("nibble")) return "Start small";
  if (s.includes("avoid") || s.includes("sell")) return "Avoid";
  return "Wait";
}
