import type { CongressTrade, CongressTradesProvider, DataResult } from "./types";

// =============================================================================
// DEMO congressional-trades adapter.
//
// IMPORTANT: the member names below are FICTIONAL on purpose. Attributing
// fabricated stock trades to real, named members of Congress — even when tagged
// "demo" — would be misleading and is exactly the kind of fake-precision this
// app is built to avoid. When you wire a real source (see congress-api.ts), the
// names come from the actual public STOCK Act filings.
//
// Everything returned here is tagged source: "demo" so it can never be shown as
// live. Amounts are RANGES and each trade carries both a trade date and a
// (later) disclosure date, to make the "lagged disclosure" reality visible.
// =============================================================================

const DEMO_TRADES: Omit<CongressTrade, "sourceLink">[] = [
  {
    id: "d1",
    member: "Rep. Jane Sample",
    chamber: "House",
    party: "D",
    state: "CA",
    symbol: "AAPL",
    asset: "Apple Inc. — Common Stock",
    type: "buy",
    amountRange: "$15,001–$50,000",
    txDate: "2026-05-20",
    disclosureDate: "2026-06-08",
  },
  {
    id: "d2",
    member: "Sen. John Placeholder",
    chamber: "Senate",
    party: "R",
    state: "TX",
    symbol: "NVDA",
    asset: "NVIDIA Corp. — Common Stock",
    type: "sell",
    amountRange: "$50,001–$100,000",
    txDate: "2026-05-12",
    disclosureDate: "2026-06-02",
  },
  {
    id: "d3",
    member: "Rep. Pat Example",
    chamber: "House",
    party: "I",
    state: "NY",
    symbol: "MSFT",
    asset: "Microsoft Corp. — Common Stock",
    type: "buy",
    amountRange: "$1,001–$15,000",
    txDate: "2026-05-28",
    disclosureDate: "2026-06-11",
  },
  {
    id: "d4",
    member: "Sen. Alex Demo",
    chamber: "Senate",
    party: "D",
    state: "WA",
    symbol: "TSLA",
    asset: "Tesla Inc. — Common Stock",
    type: "sell",
    amountRange: "$100,001–$250,000",
    txDate: "2026-04-30",
    disclosureDate: "2026-05-22",
  },
  {
    id: "d5",
    member: "Rep. Jane Sample",
    chamber: "House",
    party: "D",
    state: "CA",
    symbol: "AMD",
    asset: "Advanced Micro Devices — Common Stock",
    type: "buy",
    amountRange: "$15,001–$50,000",
    txDate: "2026-05-18",
    disclosureDate: "2026-06-06",
  },
];

function demoResult(rows: Omit<CongressTrade, "sourceLink">[]): DataResult<CongressTrade[]> {
  const data: CongressTrade[] = rows.map((r) => ({ ...r, sourceLink: null }));
  return {
    data,
    source: "demo",
    asOf: new Date().toISOString(),
    provider: "demo",
    note: "Demo data with fictional members — not live filings.",
  };
}

export const congressDemoProvider: CongressTradesProvider = {
  name: "demo",
  async getRecent(limit = 25) {
    const sorted = [...DEMO_TRADES].sort((a, b) =>
      b.disclosureDate.localeCompare(a.disclosureDate),
    );
    return demoResult(sorted.slice(0, limit));
  },
  async getByMember(member: string) {
    const q = member.toLowerCase();
    return demoResult(DEMO_TRADES.filter((t) => t.member.toLowerCase().includes(q)));
  },
  async getByTicker(symbol: string) {
    const q = symbol.toUpperCase();
    return demoResult(DEMO_TRADES.filter((t) => t.symbol === q));
  },
};
