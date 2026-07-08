import { getConnectorValue } from "@/lib/connectors/runtime";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { getMarketStatus } from "@/lib/market-status";

// =============================================================================
// Intraday (same-session) price bars for the 1D portfolio chart. FMP's
// historical-chart/15min endpoint returns today's session at 15-minute
// granularity. We cache each symbol's series in server_cache so a portfolio of N
// names doesn't re-hit FMP on every dashboard load:
//   • during market hours → 5-minute TTL (fresh intraday)
//   • when closed         → 1-hour TTL (session is frozen; no need to refetch)
//
// Plan-restriction handling mirrors the batch-quote fix: if the endpoint returns
// a 4xx (plan-restricted), we remember that in server_cache for 24h and report
// `disabled:true` so callers degrade the 1D view to the day-change number with a
// small note — never a fake two-point line.
// =============================================================================

const BASE = "https://financialmodelingprep.com/stable";

export interface IntradayBar { time: string; close: number } // time = "HH:MM" ET
export interface IntradayResult { bars: IntradayBar[]; disabled: boolean }

const DISABLED_KEY = "fmp:intraday-disabled";
const DISABLED_TTL_MS = 24 * 60 * 60 * 1000;
let disabledUntilMem = 0;

function key(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

function intradayTtlMs(): number {
  return getMarketStatus().phase === "open" ? 5 * 60 * 1000 : 60 * 60 * 1000;
}

export async function intradayDisabled(): Promise<boolean> {
  if (Date.now() < disabledUntilMem) return true;
  try {
    const { value } = await readServerCache<{ until: number }>(DISABLED_KEY, Number.MAX_SAFE_INTEGER);
    if (value && typeof value.until === "number" && Date.now() < value.until) {
      disabledUntilMem = value.until;
      return true;
    }
  } catch { /* treat as not disabled */ }
  return false;
}

async function disableIntraday(status: number): Promise<void> {
  const until = Date.now() + DISABLED_TTL_MS;
  disabledUntilMem = until;
  try { await writeServerCache(DISABLED_KEY, { until }); } catch { /* mem memo holds */ }
  // Category inference in error-log will tag this market_data.
  void status;
}

// ── Hourly bars for the 1M range (denser than daily closes) ────────────────────
// FMP's historical-chart/1hour endpoint gives multi-day hourly bars. Same probe-
// and-remember fallback as batch-quote: a 4xx disables the hourly endpoint for
// 24h and the caller falls back to daily closes. Separate memo from the 15-min
// (1D) endpoint since plans may allow one but not the other.
const HOURLY_DISABLED_KEY = "fmp:hourly-disabled";
let hourlyDisabledUntilMem = 0;

export async function hourlyDisabled(): Promise<boolean> {
  if (Date.now() < hourlyDisabledUntilMem) return true;
  try {
    const { value } = await readServerCache<{ until: number }>(HOURLY_DISABLED_KEY, Number.MAX_SAFE_INTEGER);
    if (value && typeof value.until === "number" && Date.now() < value.until) {
      hourlyDisabledUntilMem = value.until;
      return true;
    }
  } catch { /* treat as not disabled */ }
  return false;
}

async function disableHourly(): Promise<void> {
  const until = Date.now() + DISABLED_TTL_MS;
  hourlyDisabledUntilMem = until;
  try { await writeServerCache(HOURLY_DISABLED_KEY, { until }); } catch { /* mem memo holds */ }
}

export interface HourlyBar { date: string; close: number } // date = "YYYY-MM-DD HH:MM"
export interface HourlyResult { bars: HourlyBar[]; disabled: boolean }

// Recent hourly closes for a symbol, oldest→newest, capped to ~lastDays sessions
// worth of points. Cached per-symbol for 1h. Returns disabled:true when the plan
// blocks the endpoint (caller should fall back to daily closes).
export async function getHourlySeries(symbol: string, lastDays = 30): Promise<HourlyResult> {
  const sym = symbol.toUpperCase();
  if (await hourlyDisabled()) return { bars: [], disabled: true };

  const cacheKey = `fmp:hourly:${sym}`;
  const cached = await readServerCache<{ bars: HourlyBar[]; at: number }>(cacheKey, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  if (cached.value && typeof cached.value.at === "number" && Date.now() - cached.value.at < 60 * 60 * 1000) {
    return { bars: cached.value.bars, disabled: false };
  }

  const KEY = key();
  if (!KEY) return { bars: [], disabled: false };
  try {
    const r = await fetch(`${BASE}/historical-chart/1hour?symbol=${encodeURIComponent(sym)}&apikey=${KEY}`, { cache: "no-store" });
    if (r.status >= 400 && r.status < 500 && r.status !== 429) { await disableHourly(); return { bars: [], disabled: true }; }
    if (!r.ok) return { bars: cached.value?.bars ?? [], disabled: false };
    const arr = (await r.json()) as Array<{ date: string; close: number }>;
    if (!Array.isArray(arr) || !arr.length) return { bars: cached.value?.bars ?? [], disabled: false };
    // newest-first → keep the most recent lastDays, then oldest→newest.
    const cutoff = new Date(String(arr[0].date).slice(0, 10));
    cutoff.setDate(cutoff.getDate() - lastDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const bars: HourlyBar[] = arr
      .filter((p) => String(p.date).slice(0, 10) >= cutoffStr)
      .map((p) => ({ date: String(p.date).slice(0, 16), close: Number(p.close) }))
      .filter((b) => b.date && Number.isFinite(b.close))
      .reverse();
    await writeServerCache(cacheKey, { bars, at: Date.now() }).catch(() => {});
    return { bars, disabled: false };
  } catch {
    return { bars: cached.value?.bars ?? [], disabled: false };
  }
}

interface CachedSeries { bars: IntradayBar[]; at: number }

// Fetch one symbol's intraday bars for today's session. Returns { bars, disabled }.
// bars is oldest→newest, labeled HH:MM (ET). Empty bars + disabled=false means a
// transient miss (no data yet / non-plan error) — caller can still show the rest.
export async function getIntradaySeries(symbol: string): Promise<IntradayResult> {
  const sym = symbol.toUpperCase();
  if (await intradayDisabled()) return { bars: [], disabled: true };

  const cacheKey = `fmp:intraday:${sym}`;
  const ttl = intradayTtlMs();
  const cached = await readServerCache<CachedSeries>(cacheKey, Number.MAX_SAFE_INTEGER).catch(() => ({ value: null } as any));
  if (cached.value && typeof cached.value.at === "number" && Date.now() - cached.value.at < ttl) {
    return { bars: cached.value.bars, disabled: false };
  }

  const KEY = key();
  if (!KEY) return { bars: [], disabled: false };

  try {
    const r = await fetch(`${BASE}/historical-chart/15min?symbol=${encodeURIComponent(sym)}&apikey=${KEY}`, { cache: "no-store" });
    if (r.status >= 400 && r.status < 500 && r.status !== 429) {
      await disableIntraday(r.status);
      return { bars: [], disabled: true };
    }
    if (!r.ok) return { bars: cached.value?.bars ?? [], disabled: false };
    const arr = (await r.json()) as Array<{ date: string; close: number }>;
    if (!Array.isArray(arr) || !arr.length) return { bars: cached.value?.bars ?? [], disabled: false };
    // FMP returns newest-first. Keep only the latest trading day, oldest→newest.
    const latestDay = String(arr[0].date).slice(0, 10);
    const bars: IntradayBar[] = arr
      .filter((p) => String(p.date).slice(0, 10) === latestDay)
      .map((p) => ({ time: String(p.date).slice(11, 16), close: Number(p.close) }))
      .filter((b) => b.time && Number.isFinite(b.close))
      .reverse();
    await writeServerCache(cacheKey, { bars, at: Date.now() } as CachedSeries).catch(() => {});
    return { bars, disabled: false };
  } catch {
    return { bars: cached.value?.bars ?? [], disabled: false };
  }
}
