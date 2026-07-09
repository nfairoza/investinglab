import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { getKey } from "@/lib/providers/fmp";

// =============================================================================
// F3 — earnings calendar for held symbols. Wraps FMP's earnings-calendar per
// symbol, caches each in server_cache (24h TTL), and returns the next upcoming
// event with its session (before/after market). DataResult-honest: a symbol
// whose fetch fails returns { next: null } rather than throwing.
// =============================================================================

const BASE = "https://financialmodelingprep.com/stable";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface EarningsEvent { symbol: string; date: string | null; session: "bmo" | "amc" | "unknown" | null }

function sessionOf(time: string | null | undefined): EarningsEvent["session"] {
  if (!time) return null;
  const t = time.toLowerCase();
  if (t.includes("bmo") || t.includes("before")) return "bmo";
  if (t.includes("amc") || t.includes("after")) return "amc";
  return "unknown";
}

async function fetchOne(symbol: string): Promise<EarningsEvent> {
  const key = getKey();
  if (!key) return { symbol, date: null, session: null };
  const cacheKey = `earnings:${symbol.toUpperCase()}`;
  const { value } = await readServerCache<EarningsEvent>(cacheKey, TTL_MS).catch(() => ({ value: null } as any));
  if (value) return value;

  try {
    const res = await fetch(`${BASE}/earnings-calendar?symbol=${encodeURIComponent(symbol)}&apikey=${key}`, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = (await res.json()) as { date: string; time?: string }[];
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (Array.isArray(arr) ? arr : []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const event: EarningsEvent = { symbol: symbol.toUpperCase(), date: upcoming?.date ?? null, session: sessionOf(upcoming?.time) };
    await writeServerCache(cacheKey, event).catch(() => {});
    return event;
  } catch {
    return { symbol: symbol.toUpperCase(), date: null, session: null };
  }
}

// Batch earnings for a set of symbols (deduped, uppercased). Runs with a small
// concurrency pool so a big portfolio doesn't fan out unbounded FMP calls.
export async function earningsForSymbols(symbols: string[]): Promise<Record<string, EarningsEvent>> {
  const uniq = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
  const out: Record<string, EarningsEvent> = {};
  const POOL = 6;
  for (let i = 0; i < uniq.length; i += POOL) {
    const batch = uniq.slice(i, i + POOL);
    const results = await Promise.all(batch.map((s) => fetchOne(s)));
    for (const e of results) out[e.symbol] = e;
  }
  return out;
}

// Format a session for the UI chip: "Thu · after close".
export function formatEarnings(e: EarningsEvent): string | null {
  if (!e.date) return null;
  const d = new Date(`${e.date}T12:00:00Z`);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const sess = e.session === "bmo" ? " · before open" : e.session === "amc" ? " · after close" : "";
  return `Earnings ${day}${sess}`;
}
