// =============================================================================
// PT1 — Signal decay honesty. Pure math for a trade's disclosure lag and its
// price move since the trade date and since the disclosure date.
//
// Deterministic and side-effect-free so it can be golden-tested. The nightly
// `pt-returns` cron feeds it cached daily price history; UI rows render the
// stored result — nothing here fetches or touches the clock beyond an injected
// `nowDate`.
// =============================================================================

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface TradeReturn {
  lagDays: number | null; // disclosure_date - transaction_date, calendar days
  sinceTradePct: number | null; // % move trade-date close -> latest close
  sinceDisclosurePct: number | null; // % move disclosure-date close -> latest close
  tradeClose: number | null;
  disclosureClose: number | null;
  latestClose: number | null;
  asOf: string | null; // date of the latest close used
}

const DAY_MS = 86_400_000;

function toDay(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Calendar-day lag between trade and disclosure. Null if either is missing or
 * disclosure precedes the trade (data error — don't fabricate a negative lag). */
export function lagDays(transactionDate: string | null | undefined, disclosureDate: string | null | undefined): number | null {
  const t = toDay(transactionDate);
  const d = toDay(disclosureDate);
  if (!t || !d) return null;
  const diff = Math.round((Date.parse(d) - Date.parse(t)) / DAY_MS);
  return diff >= 0 ? diff : null;
}

/** The close on `date`, or the NEXT trading day's close if `date` was a
 * weekend/holiday (markets closed). Points must be sorted oldest->newest.
 * Returns null if `date` is after the last available point. */
export function closeAtOrAfter(points: PricePoint[], date: string): number | null {
  const target = toDay(date);
  if (!target) return null;
  for (const p of points) {
    if (p.date >= target && Number.isFinite(p.close)) return p.close;
  }
  return null;
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || from === 0 || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

/**
 * Compute lag + since-trade/since-disclosure returns from a daily price series.
 * `nowDate` bounds "latest" so tests are deterministic; in production it's today.
 * The latest close is the last point at or before nowDate (markets closed today
 * → last available close, which is the honest number).
 */
export function computeTradeReturn(
  points: PricePoint[],
  transactionDate: string | null | undefined,
  disclosureDate: string | null | undefined,
  nowDate: string,
): TradeReturn {
  const lag = lagDays(transactionDate, disclosureDate);
  const sorted = [...points].filter((p) => toDay(p.date) && Number.isFinite(p.close)).sort((a, b) => a.date.localeCompare(b.date));

  const now = toDay(nowDate)!;
  let latest: PricePoint | null = null;
  for (const p of sorted) {
    if (p.date <= now) latest = p;
    else break;
  }
  const latestClose = latest?.close ?? null;
  const asOf = latest?.date ?? null;

  const t = toDay(transactionDate);
  const d = toDay(disclosureDate);
  const tradeClose = t ? closeAtOrAfter(sorted, t) : null;
  const disclosureClose = d ? closeAtOrAfter(sorted, d) : null;

  return {
    lagDays: lag,
    sinceTradePct: pct(tradeClose, latestClose),
    sinceDisclosurePct: pct(disclosureClose, latestClose),
    tradeClose,
    disclosureClose,
    latestClose,
    asOf,
  };
}
