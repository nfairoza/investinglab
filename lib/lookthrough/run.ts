import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { marketData, etfData } from "@/lib/providers";
import { detectLeverage, isSwapBased } from "@/lib/etf/classify";
import { computeLookthrough, type HoldingValue, type EtfExposure, type EtfConstituent, type LookthroughResult } from "./compute";

// E3 — look-through nightly job + on-change recompute.
//
// For each user's holdings, fan every held ETF into its constituent weights and
// compute per-symbol + per-sector look-through exposure, cached per user in
// lookthrough_exposure. ETF constituent weights are cached GLOBALLY (etf:const:SYM)
// so we fetch each ETF's holdings at most once per day regardless of how many users
// hold it — no per-user API fan-out. Values use holdings.market_value when present,
// else the shares×avg_cost proxy (same call-free approach as the insights job).

const CURSOR_KEY = "lookthrough:cursor";
const CONST_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedConstituents {
  constituents: EtfConstituent[];
  leverageFactor: number;
  notional: boolean;
}

// Fetch + cache one ETF's constituent weights (+ leverage/swap classification).
// Returns null when the ETF's holdings aren't available on-plan.
export async function getEtfConstituents(symbol: string): Promise<CachedConstituents | null> {
  const key = `etf:const:${symbol.toUpperCase()}`;
  const cached = await readServerCache<CachedConstituents>(key, CONST_TTL_MS);
  if (cached.value && !cached.stale) return cached.value;

  const [holdings, profile] = await Promise.all([
    etfData.holdings(symbol),
    marketData.getCompanyProfile(symbol),
  ]);
  if (!holdings.data || holdings.data.length === 0) {
    // Serve a stale cache if we have one, else give up for this run.
    return cached.value ?? null;
  }
  const lev = detectLeverage(profile.data?.name ?? null);
  const swap = isSwapBased(holdings.data);
  const constituents: EtfConstituent[] = holdings.data
    .filter((h) => h.symbol && h.weight > 0)
    .map((h) => ({ symbol: h.symbol, weight: h.weight, sector: null }));
  const value: CachedConstituents = {
    constituents,
    // Swap-based leveraged funds contribute NOTIONAL exposure = index weight ×
    // |leverage|; plain funds are 1×.
    leverageFactor: lev.leveraged && swap.swapBased ? Math.abs(lev.factor) : 1,
    notional: lev.leveraged && swap.swapBased,
  };
  await writeServerCache(key, value);
  return value;
}

// Resolve per-holding dollar values for one user (market_value first, else proxy)
// plus which symbols are ETFs (from cached company profiles).
async function loadUserHoldings(db: SupabaseClient, userId: string): Promise<{ holdings: HoldingValue[]; etfSymbols: string[] }> {
  const { data: rows } = await db
    .from("holdings")
    .select("symbol,shares,avg_cost,market_value")
    .eq("user_id", userId);
  const holdings: HoldingValue[] = [];
  const etfSymbols: string[] = [];
  for (const r of rows ?? []) {
    const symbol = String((r as any).symbol).toUpperCase();
    const shares = Number((r as any).shares) || 0;
    const mv = Number((r as any).market_value);
    const value = Number.isFinite(mv) && mv > 0 ? mv : shares * (Number((r as any).avg_cost) || 0);
    if (value <= 0) continue;
    // Classify ETF-ness from the (7d-cached) company profile — cheap on repeat.
    const profile = await marketData.getCompanyProfile(symbol).catch(() => null);
    const isEtf = Boolean(profile?.data?.isEtf || profile?.data?.isFund);
    holdings.push({ symbol, value, isEtf });
    if (isEtf) etfSymbols.push(symbol);
  }
  return { holdings, etfSymbols };
}

// Compute + persist one user's look-through. Exported for the on-holdings-change
// recompute hook (uses the user-scoped client) and the nightly job (service role).
export async function recomputeLookthroughForUser(db: SupabaseClient, userId: string): Promise<LookthroughResult> {
  const { holdings, etfSymbols } = await loadUserHoldings(db, userId);

  const etfs: EtfExposure[] = [];
  for (const sym of new Set(etfSymbols)) {
    const c = await getEtfConstituents(sym);
    if (!c) continue;
    const held = holdings.find((h) => h.symbol === sym);
    etfs.push({
      symbol: sym,
      value: held?.value ?? 0,
      constituents: c.constituents,
      leverageFactor: c.leverageFactor,
      notional: c.notional,
    });
  }

  // Direct-holding sectors from company profiles (cheap, 7d-cached).
  const symbolSectors: Record<string, string | null> = {};
  for (const h of holdings) {
    if (h.isEtf) continue;
    const p = await marketData.getCompanyProfile(h.symbol).catch(() => null);
    symbolSectors[h.symbol] = p?.data?.sector ?? null;
  }

  const result = computeLookthrough(holdings, etfs, symbolSectors);
  await db.from("lookthrough_exposure").upsert(
    {
      user_id: userId,
      by_symbol: result.bySymbol,
      by_sector: result.bySector,
      total_value: result.totalValue,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return result;
}

// Nightly job entry — chunks users per tick (Hobby 10s cap) like the insights job.
export async function runLookthroughBuild(opts: { sliceSize?: number } = {}): Promise<{ users: number; computed: number; wrapped: boolean }> {
  const db = serviceClient();
  if (!db) return { users: 0, computed: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 25;

  const { data } = await db.from("holdings").select("user_id").limit(50_000);
  const users = Array.from(new Set((data ?? []).map((r: any) => String(r.user_id)))).sort();
  if (users.length === 0) return { users: 0, computed: 0, wrapped: true };

  const cur = (await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER)).value ?? { i: 0 };
  const start = cur.i % users.length;
  const slice = users.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= users.length;

  let computed = 0;
  for (const userId of slice) {
    try { await recomputeLookthroughForUser(db, userId); computed++; }
    catch { /* one user's failure doesn't abort the tick */ }
  }
  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize });
  return { users: users.length, computed, wrapped };
}
