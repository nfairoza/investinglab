// Portfolio day-change aggregation, isolated + pure so it can be unit-tested and
// so a single bad quote can't silently poison the headline number.
//
// The failure mode this guards against: one holding's quote is internally
// inconsistent (a fallback quote where price/change/changePct disagree) or has a
// stale previous-close (changePct reads -50% on a name that barely moved). Summed
// blindly, one row can make a calm day read as a crash — and that number feeds
// every insight/digest downstream.
//
// Two tiers of suspicion:
//   (1) INCONSISTENT — price×changePct disagrees with the absolute `change`.
//       Exclude immediately; the quote contradicts itself, no appeal.
//   (2) MAGNITUDE — a big move (>45%) that is internally CONSISTENT. Could be a
//       real earnings crash. Don't exclude on magnitude alone: the caller must
//       verify it against a SECOND source (daily-history endpoint, so a stale
//       quote-cache can't corroborate itself). Include if confirmed; exclude only
//       if the second source disagrees.
//
// Numbers are never silently adjusted — excluded holdings are returned so the UI
// can show a marker ("N holdings excluded, data issue").

export interface DayChangeInput {
  symbol: string;
  shares: number;
  price: number | null;      // current price ($/share)
  change: number | null;     // day change ($/share), absolute
  changePct: number | null;  // day change (%)
  value?: number | null;     // market value if known (e.g. broker-provided)
}

export type SuspectKind = "inconsistent" | "magnitude" | "unverified" | "contradicted";

export interface Suspect {
  symbol: string;
  reason: string;
  changePct: number | null;
  kind: SuspectKind;
  price: number | null;
  moveDollars: number;  // its contribution if it WERE trusted
  value: number;        // its current value
}

export interface DayChangeBase {
  dayChange: number;
  currentValue: number;
  prevValue: number;
}

export interface DayChangeClassification {
  base: DayChangeBase;      // totals from trusted holdings only (excludes suspects)
  excluded: Suspect[];      // definitively excluded now (inconsistent)
  pending: Suspect[];       // magnitude-only — need history verification
}

export interface DayChangeResult {
  dayChange: number;
  dayChangePct: number | null;
  currentValue: number;
  prevValue: number;
  excluded: Suspect[];      // final excluded set (inconsistent + contradicted/unverified)
}

// A single stock moving more than this in one day is suspicious enough to warrant
// a second-source check. Generous so genuine large-cap gaps still pass without a
// history round-trip.
const IMPLAUSIBLE_PCT = 45;

// The three quote fields must agree. `change` ($) = price − prevClose and
// `changePct` = change/prevClose, so prevClose = price/(1 + changePct/100) and
// the implied dollar change is price − prevClose. (Using price×changePct/100 is
// only correct for tiny moves; it wrongly flags legit large moves as bad.)
// Allow 1% of price (or $0.02) of slack for rounding/timing.
function inconsistent(price: number, change: number, changePct: number): boolean {
  const denom = 1 + changePct / 100;
  if (denom <= 0) return false; // -100%+ is nonsensical; let magnitude tier handle it
  const prevClose = price / denom;
  const impliedChange = price - prevClose;
  const tol = Math.max(0.02, price * 0.01);
  return Math.abs(impliedChange - change) > tol;
}

function moveOf(chg: number | null, price: number | null, pct: number | null, shares: number, value: number): number {
  if (chg != null && price != null) return chg * shares;
  if (pct != null) return (pct / 100) * value;
  return 0;
}

// Phase 1 (sync): split holdings into trusted totals, hard-excluded, and pending.
export function classifyDayChange(holdings: DayChangeInput[]): DayChangeClassification {
  let dayChange = 0, currentValue = 0, prevValue = 0;
  const excluded: Suspect[] = [];
  const pending: Suspect[] = [];

  for (const h of holdings) {
    const shares = h.shares || 0;
    const price = h.price;
    const value = h.value ?? (price != null ? price * shares : null);
    if (value == null || value === 0) continue;

    const pct = h.changePct;
    const chg = h.change;

    if (pct == null && chg == null) { currentValue += value; prevValue += value; continue; }

    const move = moveOf(chg, price, pct, shares, value);

    // Tier 1: internally inconsistent → exclude now, no verification.
    if (price != null && chg != null && pct != null && price > 0 && inconsistent(price, chg, pct)) {
      excluded.push({ symbol: h.symbol, reason: `price×changePct (${(price * pct / 100).toFixed(2)}) disagrees with change (${chg.toFixed(2)})`, changePct: pct, kind: "inconsistent", price, moveDollars: move, value });
      continue;
    }

    // Tier 2: big but consistent → pending second-source verification.
    if (pct != null && Math.abs(pct) > IMPLAUSIBLE_PCT) {
      pending.push({ symbol: h.symbol, reason: `${pct.toFixed(1)}% move exceeds ${IMPLAUSIBLE_PCT}% — needs history confirmation`, changePct: pct, kind: "magnitude", price, moveDollars: move, value });
      continue;
    }

    // Trusted.
    dayChange += move;
    currentValue += value;
    prevValue += value - move;
  }

  return { base: { dayChange, currentValue, prevValue }, excluded, pending };
}

// Verify a claimed daily move against independent daily closes. `closes` is a
// list of recent daily closing prices (oldest→newest) from the price-history
// endpoint — a DIFFERENT source than the quote cache, so a stale quote can't
// corroborate itself. Confirmed if either of the last two closes, used as the
// previous close, implies a move within tolerance of the claimed changePct.
export function verifyAgainstHistory(price: number, changePct: number, closes: number[]): boolean {
  if (!(price > 0) || !closes.length) return false;
  const tolPct = Math.max(1, Math.abs(changePct) * 0.15); // 15% relative, min 1pp
  for (const prev of closes.slice(-2)) {
    if (!(prev > 0)) continue;
    const implied = ((price - prev) / prev) * 100;
    if (Math.abs(implied - changePct) <= tolPct) return true;
  }
  return false;
}

// Fold a verified pending suspect (or exclude it) into a running tally. Shared by
// the sync + async resolvers.
function applyPending(
  p: Suspect, closes: number[],
  acc: { dayChange: number; currentValue: number; prevValue: number; excluded: Suspect[] },
): void {
  const confirmed = p.price != null && p.changePct != null && verifyAgainstHistory(p.price, p.changePct, closes);
  if (confirmed) {
    acc.dayChange += p.moveDollars;
    acc.currentValue += p.value;
    acc.prevValue += p.value - p.moveDollars;
  } else {
    acc.excluded.push({
      ...p,
      kind: closes.length ? "contradicted" : "unverified",
      reason: closes.length
        ? `${p.reason}; daily history did not confirm the move`
        : `${p.reason}; no daily history available to confirm`,
    });
  }
}

function finalize(acc: { dayChange: number; currentValue: number; prevValue: number; excluded: Suspect[] }): DayChangeResult {
  const dayChangePct = acc.prevValue > 0 ? (acc.dayChange / acc.prevValue) * 100 : null;
  return { dayChange: acc.dayChange, dayChangePct, currentValue: acc.currentValue, prevValue: acc.prevValue, excluded: acc.excluded };
}

// Sync resolver: verify pending suspects against a pre-fetched daily-closes map
// (e.g. the histories the dashboard already loaded). Same second-source guarantee
// as long as `closesBySymbol` comes from the history endpoint, not the quote.
export function resolveDayChangeSync(
  holdings: DayChangeInput[],
  closesBySymbol: Record<string, number[]>,
): DayChangeResult {
  const c = classifyDayChange(holdings);
  const acc = { ...c.base, excluded: [...c.excluded] };
  for (const p of c.pending) applyPending(p, closesBySymbol[p.symbol] ?? [], acc);
  return finalize(acc);
}

// Async resolver: fetch closes per pending suspect on demand. `fetchCloses` is
// injected so this is testable without network.
export async function resolveDayChange(
  holdings: DayChangeInput[],
  fetchCloses: (symbol: string) => Promise<number[]>,
): Promise<DayChangeResult> {
  const c = classifyDayChange(holdings);
  const acc = { ...c.base, excluded: [...c.excluded] };
  for (const p of c.pending) {
    let closes: number[] = [];
    try { closes = await fetchCloses(p.symbol); } catch { closes = []; }
    applyPending(p, closes, acc);
  }
  return finalize(acc);
}
