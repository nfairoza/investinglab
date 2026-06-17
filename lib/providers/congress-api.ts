import {
  type CongressChamber,
  type CongressTrade,
  type CongressTradesProvider,
  type DataResult,
  type TradeType,
  live,
  unavailable,
} from "./types";
import { getConnectorValue } from "@/lib/connectors/runtime";

// =============================================================================
// LIVE congressional-trades adapter — backed by Financial Modeling Prep's
// Senate/House disclosure endpoints. These come from the official public filings
// (Senate eFD + House Clerk PTRs) and are included in the FMP Starter plan, so
// they reuse the SAME key as the rest of the market data — no extra key needed.
//
// Endpoints (FMP stable):
//   /senate-latest?page=&limit=        /house-latest?page=&limit=
//   /senate-trades?symbol=             /house-trades?symbol=
//   /senate-trades-by-name?name=       /house-trades-by-name?name=
// =============================================================================

const BASE = "https://financialmodelingprep.com/stable";
const NAME = "congress-fmp";

function getKey(): string {
  return getConnectorValue("MARKET_DATA_API_KEY") || getConnectorValue("FINANCIAL_DATA_API_KEY") || "";
}

// FMP's `type` is free-text ("Purchase", "Sale", "Sale (Full)", "Exchange").
function mapType(raw: string): TradeType {
  const t = (raw || "").toLowerCase();
  if (t.includes("purchase") || t.includes("buy")) return "buy";
  if (t.includes("exchange")) return "exchange";
  return "sell"; // "sale", "sale (partial/full)", etc.
}

function partyFor(): string | undefined {
  return undefined; // FMP rows don't include party; left blank rather than guessed.
}

// Map one FMP row (senate or house shape — they share fields) to CongressTrade.
function mapRow(r: any, chamber: CongressChamber, idx: number): CongressTrade {
  const member =
    r.office ||
    [r.firstName, r.lastName].filter(Boolean).join(" ") ||
    "Unknown";
  return {
    id: `${chamber}-${r.transactionDate ?? ""}-${r.symbol ?? r.assetDescription ?? ""}-${member}-${idx}`,
    member,
    chamber,
    party: partyFor(),
    state: r.district || undefined,
    symbol: r.symbol ? String(r.symbol).toUpperCase() : null,
    asset: r.assetDescription || r.symbol || "Undisclosed asset",
    type: mapType(r.type),
    amountRange: r.amount || "Not disclosed",
    txDate: r.transactionDate || r.disclosureDate || "",
    disclosureDate: r.disclosureDate || "",
    sourceLink: r.link || null,
  };
}

async function fetchRows(endpoint: string): Promise<any[]> {
  const key = getKey();
  const sep = endpoint.includes("?") ? "&" : "?";
  const r = await fetch(`${BASE}/${endpoint}${sep}apikey=${key}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`FMP HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function byDisclosureDesc(a: CongressTrade, b: CongressTrade): number {
  return (b.disclosureDate || "").localeCompare(a.disclosureDate || "");
}

export const congressApiProvider: CongressTradesProvider = {
  name: NAME,

  async getRecent(limit = 25): Promise<DataResult<CongressTrade[]>> {
    if (!getKey()) return unavailable(NAME, "MARKET_DATA_API_KEY not set");
    try {
      // Pull both chambers' latest pages and interleave by disclosure date.
      const pages = Math.min(4, Math.ceil(limit / 25));
      const reqs: Promise<any[]>[] = [];
      for (let p = 0; p < pages; p++) {
        reqs.push(fetchRows(`senate-latest?page=${p}&limit=100`));
        reqs.push(fetchRows(`house-latest?page=${p}&limit=100`));
      }
      const results = await Promise.all(reqs);
      const trades: CongressTrade[] = [];
      results.forEach((rows, i) => {
        const chamber: CongressChamber = i % 2 === 0 ? "Senate" : "House";
        rows.forEach((r, idx) => trades.push(mapRow(r, chamber, idx)));
      });
      trades.sort(byDisclosureDesc);
      return live(NAME, trades.slice(0, limit));
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "fetch failed");
    }
  },

  async getByMember(member: string): Promise<DataResult<CongressTrade[]>> {
    if (!getKey()) return unavailable(NAME, "MARKET_DATA_API_KEY not set");
    const name = encodeURIComponent(member.trim());
    try {
      const [sen, hou] = await Promise.all([
        fetchRows(`senate-trades-by-name?name=${name}`).catch(() => []),
        fetchRows(`house-trades-by-name?name=${name}`).catch(() => []),
      ]);
      const trades = [
        ...sen.map((r, i) => mapRow(r, "Senate", i)),
        ...hou.map((r, i) => mapRow(r, "House", i)),
      ].sort(byDisclosureDesc);
      return live(NAME, trades);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "fetch failed");
    }
  },

  async getByTicker(symbol: string): Promise<DataResult<CongressTrade[]>> {
    if (!getKey()) return unavailable(NAME, "MARKET_DATA_API_KEY not set");
    const sym = encodeURIComponent(symbol.trim().toUpperCase());
    try {
      const [sen, hou] = await Promise.all([
        fetchRows(`senate-trades?symbol=${sym}`).catch(() => []),
        fetchRows(`house-trades?symbol=${sym}`).catch(() => []),
      ]);
      const trades = [
        ...sen.map((r, i) => mapRow(r, "Senate", i)),
        ...hou.map((r, i) => mapRow(r, "House", i)),
      ].sort(byDisclosureDesc);
      return live(NAME, trades);
    } catch (e) {
      return unavailable(NAME, e instanceof Error ? e.message : "fetch failed");
    }
  },
};
