import { serviceClient } from "@/lib/service-client";
import { writeServerCache } from "@/lib/server-cache";
import { partyFor } from "@/lib/congress/committees";
import { computeFlow, type FlowTrade, type FlowResult } from "./flow";

// PT6 — flow build. Aggregates the last ~90 days of congressional trades into
// monthly net-buying-by-sector + top net-bought/sold tickers, and caches the
// full unfiltered dataset in server_cache. The API applies chamber/party filters
// at read time from the cached raw trades (cheap), so one build serves all views.
//
// Party is resolved via the @unitedstates roster (partyFor); sector comes from
// the PT4 power_trade_flags join. Global, no per-user work. asOf stamped.

const CACHE_KEY = "pt:flow";
const LOOKBACK_DAYS = 90;

export interface FlowCache {
  trades: FlowTrade[]; // raw, unfiltered — the API filters + aggregates on read
  builtAt: string;
  windowDays: number;
}

export async function runPtFlow(nowMs = Date.now()): Promise<{ ok: boolean; trades: number; note: string }> {
  const db = serviceClient();
  if (!db) return { ok: false, trades: 0, note: "no service client" };

  const since = new Date(nowMs - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await db
    .from("power_trade_records")
    .select("ticker, person_name, person_id, transaction_type, transaction_date, amount_min, amount_max, chamber_or_branch, power_trade_flags(sector)")
    .in("chamber_or_branch", ["house", "senate"])
    .in("transaction_type", ["buy", "sell"])
    .not("ticker", "is", null)
    .gte("transaction_date", since)
    .limit(20_000);

  // Resolve party once per distinct person (roster is 24h-cached internally).
  const partyCache = new Map<string, string>();
  const trades: FlowTrade[] = [];
  for (const r of (rows ?? []) as any[]) {
    const name = String(r.person_name ?? "");
    let party = partyCache.get(name);
    if (party === undefined) {
      party = await partyFor(null, name).catch(() => "");
      partyCache.set(name, party);
    }
    const flag = Array.isArray(r.power_trade_flags) ? r.power_trade_flags[0] : r.power_trade_flags;
    trades.push({
      ticker: String(r.ticker).toUpperCase(),
      sector: flag?.sector ?? null,
      type: r.transaction_type,
      amountMin: r.amount_min != null ? Number(r.amount_min) : null,
      amountMax: r.amount_max != null ? Number(r.amount_max) : null,
      chamber: r.chamber_or_branch,
      party: party || null,
      month: r.transaction_date ? String(r.transaction_date).slice(0, 7) : "",
    });
  }

  const cache: FlowCache = { trades, builtAt: new Date(nowMs).toISOString(), windowDays: LOOKBACK_DAYS };
  await writeServerCache(CACHE_KEY, cache);
  const agg: FlowResult = computeFlow(trades);
  return { ok: true, trades: trades.length, note: `${trades.length} trades, ${agg.bySector.length} sectors, ${agg.months.length} months` };
}

export const FLOW_CACHE_KEY = CACHE_KEY;
