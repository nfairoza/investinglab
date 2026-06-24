// =============================================================================
// Power Trades Tracker — canonical types. Mirrors the spec data model.
// Phase 1 implements only the FMP congressional source; the rest are stubbed.
// =============================================================================

export type PowerTradeSource =
  | "fmp_congress"
  | "fmp_insider"
  | "quiver"
  | "house_disclosure"
  | "senate_disclosure"
  | "sec_form_4"
  | "executive_oge"
  | "fec"
  | "opensecrets"
  | "manual_watchlist";

export type PowerRelationship =
  | "self" | "spouse" | "dependent" | "trust" | "family_disclosed" | "unknown";

export type PowerTransactionType =
  | "buy" | "sell" | "exchange" | "option" | "gift" | "income" | "holding" | "unknown";

export type PowerChamberOrBranch = "house" | "senate" | "executive" | "corporate" | "other";

export interface PowerTradeRecord {
  id: string;
  source: PowerTradeSource;
  sourceUrl?: string | null;
  providerRecordId?: string | null;
  dedupeKey: string;
  personId?: string | null;
  personName: string;
  personRole?: string | null;
  relatedPersonName?: string | null;
  relationship?: PowerRelationship;
  entityName?: string | null;
  ticker?: string | null;
  assetName?: string | null;
  transactionType?: PowerTransactionType;
  transactionDate?: string | null;
  disclosureDate?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  amountLabel?: string | null;
  filingType?: string | null;
  chamberOrBranch?: PowerChamberOrBranch;
  confidenceScore?: number | null;
  tags?: string[];
  parserVersion?: string | null;
}

export type PowerPersonCategory =
  | "congress" | "executive" | "corporate_insider" | "lobbyist"
  | "donor" | "advisor" | "family_member" | "celebrity" | "other";

export interface PowerPerson {
  id: string;
  canonicalName: string;
  aliases: string[];
  identifiers?: {
    bioguideId?: string; fmpSenateId?: string; secCik?: string;
    fecCandidateId?: string; opensecretsId?: string; quiverId?: string;
  };
  category: PowerPersonCategory;
  roles: string[];
  party?: string;
  state?: string;
  office?: string;
  sourceCoverage: PowerTradeSource[];
  latestDisclosureDate?: string | null;
  tradeCount30d: number;
  tradeCount90d: number;
  tradeCount1y: number;
  tradeCountAll: number;
}

export interface PowerSourceStatus {
  source: PowerTradeSource;
  label: string;
  enabled: boolean;
  built: boolean;        // is an adapter actually implemented this phase?
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export type PowerWindow = "30d" | "90d" | "1y" | "all";
