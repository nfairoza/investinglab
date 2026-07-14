// =============================================================================
// PT6 — Flow views. Monthly aggregates of congressional trading from the synced
// trades: net buying by sector (heatmap), top net-bought/net-sold tickers, with
// chamber/party filtering. Pure + deterministic so it can be golden-tested; the
// cron does the DB assembly and caches the result in server_cache.
//
// Amount weighting uses the BAND MIDPOINT — congressional amounts are disclosed
// as ranges, and a consistent midpoint is the only way to weight aggregate flow.
// This is internal weighting only; UI copy still shows the band, never a made-up
// midpoint (see docs/PT_METHOD.md).
// =============================================================================

export interface FlowTrade {
  ticker: string;
  sector: string | null;
  type: "buy" | "sell" | string | null;
  amountMin: number | null;
  amountMax: number | null;
  chamber: "house" | "senate" | string | null;
  party: string | null; // "D" | "R" | "I" | null
  month: string; // YYYY-MM (transaction month)
}

export interface FlowFilter {
  chamber?: "house" | "senate" | "all";
  party?: "D" | "R" | "I" | "all";
}

export interface SectorFlow {
  sector: string;
  netBuy: number; // buy − sell dollar flow (midpoint-weighted)
  buyVol: number;
  sellVol: number;
  trades: number;
}
export interface TickerFlow {
  ticker: string;
  net: number; // buy − sell
  trades: number;
}
export interface FlowResult {
  bySector: SectorFlow[]; // sorted by |netBuy| desc
  topBought: TickerFlow[]; // most net-bought first
  topSold: TickerFlow[]; // most net-sold first
  months: string[]; // the distinct months represented
  totalTrades: number;
}

// Midpoint of a disclosed band (min/max). Falls back to max, then 0.
export function bandMidpoint(min: number | null, max: number | null): number {
  const lo = min == null ? null : Number(min);
  const hi = max == null ? null : Number(max);
  const loOk = lo != null && Number.isFinite(lo);
  const hiOk = hi != null && Number.isFinite(hi);
  if (loOk && hiOk && hi! > 0) return (lo! + hi!) / 2;
  if (hiOk && hi! > 0) return hi!;
  if (loOk && lo! > 0) return lo!;
  return 0;
}

function passes(t: FlowTrade, f: FlowFilter): boolean {
  if (f.chamber && f.chamber !== "all" && t.chamber !== f.chamber) return false;
  if (f.party && f.party !== "all" && (t.party ?? "") !== f.party) return false;
  return true;
}

export function computeFlow(trades: FlowTrade[], filter: FlowFilter = {}, topN = 10): FlowResult {
  const sectors = new Map<string, SectorFlow>();
  const tickers = new Map<string, TickerFlow>();
  const months = new Set<string>();
  let total = 0;

  for (const t of trades) {
    if (t.type !== "buy" && t.type !== "sell") continue;
    if (!passes(t, filter)) continue;
    const amt = bandMidpoint(t.amountMin, t.amountMax);
    if (amt <= 0) continue;
    const signed = t.type === "buy" ? amt : -amt;
    total++;
    if (t.month) months.add(t.month);

    const sectorKey = t.sector || "Other";
    const s = sectors.get(sectorKey) ?? { sector: sectorKey, netBuy: 0, buyVol: 0, sellVol: 0, trades: 0 };
    s.netBuy += signed;
    if (t.type === "buy") s.buyVol += amt; else s.sellVol += amt;
    s.trades++;
    sectors.set(sectorKey, s);

    const tk = (t.ticker || "").toUpperCase();
    if (tk) {
      const c = tickers.get(tk) ?? { ticker: tk, net: 0, trades: 0 };
      c.net += signed;
      c.trades++;
      tickers.set(tk, c);
    }
  }

  const round = (n: number) => Math.round(n);
  const bySector = Array.from(sectors.values())
    .map((s) => ({ ...s, netBuy: round(s.netBuy), buyVol: round(s.buyVol), sellVol: round(s.sellVol) }))
    .sort((a, b) => Math.abs(b.netBuy) - Math.abs(a.netBuy));

  const tickerList = Array.from(tickers.values()).map((t) => ({ ...t, net: round(t.net) }));
  const topBought = tickerList.filter((t) => t.net > 0).sort((a, b) => b.net - a.net).slice(0, topN);
  const topSold = tickerList.filter((t) => t.net < 0).sort((a, b) => a.net - b.net).slice(0, topN);

  return { bySector, topBought, topSold, months: Array.from(months).sort(), totalTrades: total };
}
