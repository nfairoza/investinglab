// Look-through exposure (E3) — pure, deterministic, unit-tested. Given a user's
// holdings and each held ETF's constituent weights, compute true exposure to each
// underlying symbol and sector by fanning ETF wrappers into their holdings:
//   exposure(sym) = direct value of sym + Σ over held ETFs ( etf value × weight(sym) )
// For swap-based LEVERAGED funds, notional exposure = index weight × |leverage|,
// labeled "notional, resets daily" in evidence (never presented as a real position).

export interface HoldingValue {
  symbol: string;
  value: number;        // market value in USD
  isEtf: boolean;
}

export interface EtfConstituent {
  symbol: string | null;  // underlying ticker (null = swap/cash/non-equity)
  weight: number;         // percent of the ETF, 0–100
  sector?: string | null; // underlying's sector, if known
}

export interface EtfExposure {
  symbol: string;                 // the ETF ticker
  value: number;                  // the user's dollar value in this ETF
  constituents: EtfConstituent[];
  leverageFactor?: number;        // |factor| for leveraged funds (notional); 1 otherwise
  notional?: boolean;             // true → exposure is notional/resets daily
}

export interface SymbolExposure {
  symbol: string;
  direct: number;        // direct holding value
  viaEtfs: number;       // added through ETF wrappers
  total: number;         // direct + viaEtfs
  sources: { etf: string; value: number; notional: boolean }[]; // evidence per ETF
}

export interface SectorExposure {
  sector: string;
  direct: number;
  viaEtfs: number;
  total: number;
}

export interface LookthroughResult {
  totalValue: number;
  bySymbol: SymbolExposure[];   // sorted by total desc
  bySector: SectorExposure[];   // sorted by total desc
}

// symbolSectors: map of ticker -> sector for DIRECT holdings (from company profiles).
export function computeLookthrough(
  holdings: HoldingValue[],
  etfs: EtfExposure[],
  symbolSectors: Record<string, string | null> = {},
): LookthroughResult {
  const totalValue = holdings.reduce((s, h) => s + Math.max(0, h.value), 0);

  const bySymbol = new Map<string, SymbolExposure>();
  const bump = (sym: string): SymbolExposure => {
    let e = bySymbol.get(sym);
    if (!e) { e = { symbol: sym, direct: 0, viaEtfs: 0, total: 0, sources: [] }; bySymbol.set(sym, e); }
    return e;
  };

  // Direct positions. An ETF held directly still counts as direct exposure to the
  // wrapper ticker (so "you hold SOXL" is visible), AND fans out below.
  for (const h of holdings) {
    if (h.value <= 0) continue;
    const e = bump(h.symbol);
    e.direct += h.value;
  }

  // Fan out each held ETF into its constituents.
  const etfByValue = new Map(etfs.map((e) => [e.symbol, e]));
  for (const h of holdings) {
    if (!h.isEtf || h.value <= 0) continue;
    const etf = etfByValue.get(h.symbol);
    if (!etf || !etf.constituents.length) continue;
    const lev = etf.leverageFactor && etf.leverageFactor > 0 ? etf.leverageFactor : 1;
    const notional = Boolean(etf.notional);
    for (const c of etf.constituents) {
      if (!c.symbol || c.weight <= 0) continue;
      const contribution = h.value * (c.weight / 100) * lev;
      const e = bump(c.symbol);
      e.viaEtfs += contribution;
      e.sources.push({ etf: h.symbol, value: contribution, notional });
    }
  }

  for (const e of bySymbol.values()) e.total = e.direct + e.viaEtfs;

  // Sector rollup. Direct sector from symbolSectors; ETF sectors from constituents.
  const bySector = new Map<string, SectorExposure>();
  const bumpSector = (sec: string): SectorExposure => {
    let e = bySector.get(sec);
    if (!e) { e = { sector: sec, direct: 0, viaEtfs: 0, total: 0 }; bySector.set(sec, e); }
    return e;
  };
  for (const h of holdings) {
    if (h.value <= 0 || h.isEtf) continue; // ETFs contribute via their constituents' sectors
    const sec = symbolSectors[h.symbol] ?? "Other";
    bumpSector(sec).direct += h.value;
  }
  for (const h of holdings) {
    if (!h.isEtf || h.value <= 0) continue;
    const etf = etfByValue.get(h.symbol);
    if (!etf) continue;
    const lev = etf.leverageFactor && etf.leverageFactor > 0 ? etf.leverageFactor : 1;
    for (const c of etf.constituents) {
      if (c.weight <= 0) continue;
      const sec = c.sector ?? (c.symbol ? symbolSectors[c.symbol] : null) ?? "Other";
      bumpSector(sec).viaEtfs += h.value * (c.weight / 100) * lev;
    }
  }
  for (const e of bySector.values()) e.total = e.direct + e.viaEtfs;

  return {
    totalValue,
    bySymbol: [...bySymbol.values()].sort((a, b) => b.total - a.total),
    bySector: [...bySector.values()].sort((a, b) => b.total - a.total),
  };
}

// Percent of portfolio for a dollar exposure (guards divide-by-zero).
export function pctOf(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}
