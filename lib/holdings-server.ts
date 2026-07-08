import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaid, plaidConfigured, selectPlaidItems, resolvePlaidToken } from "@/lib/plaid";
import { readSnapshots, writeSnapshot } from "@/lib/plaid-snapshot";
import { CountryCode, type Holding as PlaidHoldingRaw, type Security } from "plaid";

// =============================================================================
// Unified holdings — the single source of truth for "what does this user own".
//
// Everything that analyzes a portfolio (Portfolio Doctor, Opportunities, Alerts,
// watchlist recs, etc.) MUST read through here so DB holdings (manual + E*TRADE
// token sync) AND Plaid-linked brokerage holdings are always merged the same way.
// Previously each route read only the `holdings` table, so a user whose
// positions come via Plaid looked like they had nothing.
//
// VESTED ONLY: for RSU/vesting awards we count the vested portion as owned. The
// unvested remainder is NOT a holding (you don't own it yet) and is deliberately
// excluded — analysis must never treat unvested stock as a position.
// =============================================================================

export interface UnifiedHolding {
  symbol: string;
  shares: number;
  avgCost: number;
  source: string;          // "manual" | "etrade" | institution name
  value: number | null;    // broker market value when available
  hasRealTicker: boolean;  // false for CUSIP-only funds we can't price/research
}

// ── Investments snapshot resolver (PA-A1) ─────────────────────────────────────
// The single place that turns linked items into their investments payload
// (holdings + securities), snapshot-first: read plaid_snapshot("investments"),
// live-fetch ONLY items missing a snapshot, then write the fresh ones back.
// Both plaidHoldings and plaidInvestmentCash derive from this, so /api/overview
// never hits Plaid live when a snapshot exists. Pass userId to enable snapshot
// writes on a live-fill (omit for pure read paths).
interface InvestmentsPayload { holdings: PlaidHoldingRaw[]; securities: Security[] }
interface ResolvedItem { itemId: string; institution: string | null; payload: InvestmentsPayload }

async function resolveInvestments(supabase: SupabaseClient, userId?: string): Promise<ResolvedItem[]> {
  if (!plaidConfigured()) return [];
  const { rows: items } = await selectPlaidItems(supabase, "item_id, institution_name");
  if (!items?.length) return [];

  const snaps = await readSnapshots<InvestmentsPayload>(supabase, "investments");
  const byId = new Map(snaps.map((s) => [s.itemId, s.payload]));
  const plaid = getPlaid();

  const needLive = (items as any[]).filter((it) => !byId.has(it.item_id));
  await Promise.all(needLive.map(async (it) => {
    const token = resolvePlaidToken(it);
    if (!token) return;
    try {
      const resp = await plaid.investmentsHoldingsGet({ access_token: token });
      const payload: InvestmentsPayload = { holdings: resp.data.holdings ?? [], securities: resp.data.securities ?? [] };
      byId.set(it.item_id, payload);
      if (userId) void writeSnapshot(supabase, userId, it.item_id, "investments", payload);
    } catch { /* item may not support investments */ }
  }));

  return (items as any[])
    .filter((it) => byId.has(it.item_id))
    .map((it) => ({ itemId: it.item_id, institution: it.institution_name ?? null, payload: byId.get(it.item_id)! }));
}

// Plaid investment holdings for the user, normalized. Vested-only for awards.
// Snapshot-first via resolveInvestments.
export async function plaidHoldings(supabase: SupabaseClient, userId?: string): Promise<UnifiedHolding[]> {
  const resolved = await resolveInvestments(supabase, userId);
  const out: UnifiedHolding[] = [];
  for (const it of resolved) {
    const secs = new Map((it.payload.securities ?? []).map((s) => [s.security_id, s]));
    for (const h of it.payload.holdings ?? []) {
      const sec = secs.get(h.security_id);
      const ticker = sec?.ticker_symbol?.trim() || null;
      const hasRealTicker = !!ticker && /^[A-Z][A-Z.\-]{0,5}$/.test(ticker.toUpperCase());
      const vestedQty = (h as any).vested_quantity;
      const vestedVal = (h as any).vested_value;
      const fullVal = h.institution_value ?? null;
      const hasVesting = vestedVal != null && fullVal != null && vestedVal < fullVal - 0.01;
      const shares = hasVesting && vestedQty != null ? Number(vestedQty) : Number(h.quantity) || 0;
      const value = hasVesting && vestedVal != null ? vestedVal : fullVal;
      if (shares <= 0) continue;
      out.push({
        symbol: hasRealTicker ? ticker!.toUpperCase() : String(sec?.name ?? "—"),
        shares,
        avgCost: h.cost_basis != null && h.quantity ? Number(h.cost_basis) / Number(h.quantity) : 0,
        source: it.institution ?? "Brokerage",
        value: value ?? null,
        hasRealTicker,
      });
    }
  }
  return out;
}

// DB holdings (manual + E*TRADE token sync) merged with Plaid brokerage holdings.
// De-dups the same brokerage if connected via BOTH E*TRADE token AND Plaid
// (E*TRADE rows win, matching the Holdings UI). `realTickersOnly` drops
// CUSIP-only fund rows that can't be priced/researched (for AI analysis).
export async function getUnifiedHoldings(
  supabase: SupabaseClient,
  opts: { realTickersOnly?: boolean; userId?: string } = {},
): Promise<UnifiedHolding[]> {
  const [{ data: dbRows }, plaid] = await Promise.all([
    supabase.from("holdings").select("symbol,shares,avg_cost,source"),
    plaidHoldings(supabase, opts.userId),
  ]);
  const db: UnifiedHolding[] = (dbRows ?? []).map((h: {
    symbol: string; shares: number | string; avg_cost: number | string; source?: string | null;
  }) => ({
    symbol: String(h.symbol).toUpperCase(),
    shares: Number(h.shares) || 0,
    avgCost: Number(h.avg_cost) || 0,
    source: h.source ?? "manual",
    value: null,
    hasRealTicker: true,
  }));
  const haveEtrade = db.some((h) => h.source === "etrade");
  const isEtradeInst = (n: string) => /e[\s*]*trade|morgan stanley/i.test(n);
  const merged = [
    ...db,
    ...plaid.filter((p) => !(haveEtrade && isEtradeInst(p.source))),
  ];
  return opts.realTickersOnly ? merged.filter((h) => h.hasRealTicker) : merged;
}

// Plaid CASH across linked INVESTMENT/brokerage accounts ("investment cash" —
// kept distinct from bank cash so the two are never conflated). Snapshot-first via
// resolveInvestments: brokerages report uninvested cash as a HOLDING (a cash-
// equivalent security "US Dollar"/"Cash" at $1.00), which is the reliable source
// and is present in the investments snapshot. Pass userId to allow snapshot
// writes on a live-fill.
export async function plaidInvestmentCash(supabase: SupabaseClient, userId?: string): Promise<number> {
  const resolved = await resolveInvestments(supabase, userId);
  let cash = 0;
  for (const it of resolved) {
    const secs = new Map((it.payload.securities ?? []).map((s) => [s.security_id, s]));
    for (const h of it.payload.holdings ?? []) {
      const sec = secs.get(h.security_id);
      const name = String(sec?.name ?? "").toLowerCase();
      const isCash = sec?.is_cash_equivalent || (sec?.type ?? "").toLowerCase() === "cash"
        || /\b(us dollar|u s dollar|usd|cash)\b/.test(name);
      if (isCash) {
        const val = h.institution_value ?? (h.quantity != null && (h.institution_price ?? sec?.close_price) != null
          ? Number(h.quantity) * Number(h.institution_price ?? sec?.close_price) : 0);
        cash += Number(val) || 0;
      }
    }
  }
  return Math.round(cash * 100) / 100;
}

// Keep the import referenced (CountryCode reserved for future institution lookups).
void CountryCode;
