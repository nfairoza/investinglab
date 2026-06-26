import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { CountryCode } from "plaid";

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

// Plaid investment holdings for the user, normalized. Vested-only for awards.
export async function plaidHoldings(supabase: SupabaseClient): Promise<UnifiedHolding[]> {
  if (!plaidConfigured()) return [];
  const { data: items } = await supabase.from("plaid_items").select("item_id, institution_name, access_token");
  if (!items?.length) return [];
  const plaid = getPlaid();
  const out: UnifiedHolding[] = [];
  for (const it of items as any[]) {
    try {
      const resp = await plaid.investmentsHoldingsGet({ access_token: it.access_token });
      const secs = new Map((resp.data.securities ?? []).map((s) => [s.security_id, s]));
      for (const h of resp.data.holdings ?? []) {
        const sec: any = secs.get(h.security_id);
        const ticker = sec?.ticker_symbol?.trim() || null;
        const hasRealTicker = !!ticker && /^[A-Z][A-Z.\-]{0,5}$/.test(ticker.toUpperCase());
        // Vested-only: if Plaid reports a vested split, count just the vested part.
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
          source: it.institution_name ?? "Brokerage",
          value: value ?? null,
          hasRealTicker,
        });
      }
    } catch { /* item may not support investments */ }
  }
  return out;
}

// DB holdings (manual + E*TRADE token sync) merged with Plaid brokerage holdings.
// De-dups the same brokerage if connected via BOTH E*TRADE token AND Plaid
// (E*TRADE rows win, matching the Holdings UI). `realTickersOnly` drops
// CUSIP-only fund rows that can't be priced/researched (for AI analysis).
export async function getUnifiedHoldings(
  supabase: SupabaseClient,
  opts: { realTickersOnly?: boolean } = {},
): Promise<UnifiedHolding[]> {
  const [{ data: dbRows }, plaid] = await Promise.all([
    supabase.from("holdings").select("symbol,shares,avg_cost,source"),
    plaidHoldings(supabase),
  ]);
  const db: UnifiedHolding[] = (dbRows ?? []).map((h: any) => ({
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
// kept distinct from bank cash so the two are never conflated).
export async function plaidInvestmentCash(supabase: SupabaseClient): Promise<number> {
  if (!plaidConfigured()) return 0;
  const { data: items } = await supabase.from("plaid_items").select("access_token");
  if (!items?.length) return 0;
  const plaid = getPlaid();
  let cash = 0;
  for (const it of items as any[]) {
    try {
      const resp = await plaid.accountsBalanceGet({ access_token: it.access_token });
      for (const a of resp.data.accounts ?? []) {
        if (a.type === "investment" || a.type === "brokerage") {
          cash += Number(a.balances?.available ?? a.balances?.current ?? 0) || 0;
        }
      }
    } catch { /* skip */ }
  }
  return Math.round(cash * 100) / 100;
}

// Keep the import referenced (CountryCode reserved for future institution lookups).
void CountryCode;
