import {
  type CongressTrade,
  type CongressTradesProvider,
  type DataResult,
  unavailable,
} from "./types";
import { getConnectorValue } from "@/lib/connectors/runtime";

// =============================================================================
// REAL congressional-trades adapter (stub — wire this in Claude Code).
// Key/base are read at call time so a key added in the Connectors UI works.
// Source options (normalized JSON): Quiver Quantitative, Lambda Finance, Apify
// scrapers, Capitol Trades. Raw House Clerk + Senate eFD are PDF-based; the old
// Stock Watcher S3 feeds are dead. Set CONGRESS_TRADES_API_KEY + _BASE.
// =============================================================================

function getKey() {
  return getConnectorValue("CONGRESS_TRADES_API_KEY");
}
function getBase() {
  return getConnectorValue("CONGRESS_TRADES_API_BASE");
}

export const congressApiProvider: CongressTradesProvider = {
  name: "congress-api",

  async getRecent(limit = 25): Promise<DataResult<CongressTrade[]>> {
    if (!getKey() || !getBase()) {
      return unavailable("congress-api", "CONGRESS_TRADES_API_KEY/BASE not set");
    }
    // TODO (Claude Code): fetch `${getBase()}/recent?limit=${limit}` with the key,
    // map rows to CongressTrade, return live(...).
    return unavailable("congress-api", "not implemented yet");
  },

  async getByMember(member: string): Promise<DataResult<CongressTrade[]>> {
    if (!getKey() || !getBase()) {
      return unavailable("congress-api", "CONGRESS_TRADES_API_KEY/BASE not set");
    }
    void member;
    return unavailable("congress-api", "not implemented yet");
  },

  async getByTicker(symbol: string): Promise<DataResult<CongressTrade[]>> {
    if (!getKey() || !getBase()) {
      return unavailable("congress-api", "CONGRESS_TRADES_API_KEY/BASE not set");
    }
    void symbol;
    return unavailable("congress-api", "not implemented yet");
  },
};
