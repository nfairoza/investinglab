import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { getKey } from "@/lib/providers/fmp";

// =============================================================================
// F4 — dividend & income. Per held symbol: trailing 12-month dividend/share (the
// forward-income basis), latest declared dividend, and next ex-dividend date.
// FMP `dividends` history is cached 24h in server_cache. All figures carry the
// data we used; positions without cost basis get yield-on-cost = null (never
// guessed).
// =============================================================================

const BASE = "https://financialmodelingprep.com/stable";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface DividendInfo {
  symbol: string;
  annualPerShare: number;   // trailing 12-month $/share (0 if none)
  frequency: number;        // payments/yr inferred (4=quarterly, 12=monthly, …)
  nextExDate: string | null;
  lastAmount: number;       // most recent single payment $/share
}

interface RawDiv { date: string; dividend?: number; adjDividend?: number }

async function fetchOne(symbol: string): Promise<DividendInfo> {
  const key = getKey();
  const empty: DividendInfo = { symbol: symbol.toUpperCase(), annualPerShare: 0, frequency: 0, nextExDate: null, lastAmount: 0 };
  if (!key) return empty;
  const cacheKey = `dividends:${symbol.toUpperCase()}`;
  const { value } = await readServerCache<DividendInfo>(cacheKey, TTL_MS).catch(() => ({ value: null } as any));
  if (value) return value;

  try {
    const res = await fetch(`${BASE}/dividends?symbol=${encodeURIComponent(symbol)}&apikey=${key}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()) as RawDiv[];
    const rows = (Array.isArray(arr) ? arr : []).filter((r) => r.date && (r.dividend ?? r.adjDividend));
    const info = computeDividendInfo(symbol, rows);
    await writeServerCache(cacheKey, info).catch(() => {});
    return info;
  } catch {
    return empty;
  }
}

// Pure: derive trailing-12m per-share, frequency, next ex-date from raw rows.
export function computeDividendInfo(symbol: string, rows: RawDiv[], nowMs = Date.now()): DividendInfo {
  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const amount = (r: RawDiv) => Number(r.dividend ?? r.adjDividend ?? 0);
  const yearAgo = new Date(nowMs - 365 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date(nowMs).toISOString().slice(0, 10);

  const past12 = sorted.filter((r) => r.date >= yearAgo && r.date <= today);
  const annualPerShare = +past12.reduce((s, r) => s + amount(r), 0).toFixed(4);
  const frequency = past12.length;
  const lastPaid = sorted.find((r) => r.date <= today);
  const nextEx = sorted.filter((r) => r.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];

  return {
    symbol: symbol.toUpperCase(),
    annualPerShare,
    frequency,
    nextExDate: nextEx?.date ?? null,
    lastAmount: lastPaid ? +amount(lastPaid).toFixed(4) : 0,
  };
}

export async function dividendsForSymbols(symbols: string[]): Promise<Record<string, DividendInfo>> {
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  const out: Record<string, DividendInfo> = {};
  const POOL = 6;
  for (let i = 0; i < uniq.length; i += POOL) {
    const results = await Promise.all(uniq.slice(i, i + POOL).map((s) => fetchOne(s)));
    for (const d of results) out[d.symbol] = d;
  }
  return out;
}

// ── Per-position income math (pure) ──
export interface PositionIncome {
  symbol: string;
  shares: number;
  price: number | null;
  annualPerShare: number;
  projectedAnnualIncome: number;   // shares * annualPerShare
  forwardYield: number | null;     // annualPerShare / price
  yieldOnCost: number | null;      // annualPerShare / avgCost (null if no cost basis)
  nextExDate: string | null;
}

export function positionIncome(opts: {
  symbol: string; shares: number; price: number | null; avgCost: number | null; div: DividendInfo;
}): PositionIncome {
  const { symbol, shares, price, avgCost, div } = opts;
  const projectedAnnualIncome = +(shares * div.annualPerShare).toFixed(2);
  const forwardYield = price && price > 0 && div.annualPerShare > 0 ? +((div.annualPerShare / price) * 100).toFixed(2) : null;
  const yieldOnCost = avgCost && avgCost > 0 && div.annualPerShare > 0 ? +((div.annualPerShare / avgCost) * 100).toFixed(2) : null;
  return { symbol, shares, price, annualPerShare: div.annualPerShare, projectedAnnualIncome, forwardYield, yieldOnCost, nextExDate: div.nextExDate };
}
