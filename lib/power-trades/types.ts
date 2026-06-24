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

// ----- Influence context (FEC + OpenSecrets) — NOT trades ------------------
// Campaign-finance + lobbying money/influence data. A SEPARATE type from
// PowerTradeRecord: never rendered in the Alpha Feed, never styled as buy/sell,
// never scored. Privacy: no individual street addresses. OpenSecrets requires
// attribution (CC BY-NC-SA); both sources are non-commercial.

export type InfluenceSource = "fec" | "opensecrets";

export type InfluenceRecordType =
  | "campaign_contribution"  // aggregated donor context (org/employer/state level)
  | "committee_summary"      // a candidate's committee financial summary
  | "lobbying"               // lobbying by issue/industry
  | "pac"                    // PAC activity
  | "revolving_door";        // revolving-door note

export interface PowerInfluenceRecord {
  id: string;
  source: InfluenceSource;
  recordType: InfluenceRecordType;
  sourceUrl: string;                 // required — link to the FEC/OpenSecrets record
  providerRecordId?: string | null;
  dedupeKey: string;
  personId?: string | null;          // FK → power_people this contextualizes
  subjectName: string;               // candidate / committee / org / firm
  counterpartyName?: string | null;  // donor org / client / registrant (NO addresses)
  city?: string | null;
  state?: string | null;
  employer?: string | null;
  occupation?: string | null;
  amount?: number | null;
  amountLabel?: string | null;
  cycleOrYear?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  issueOrIndustry?: string | null;
  attribution?: string | null;       // e.g. "Source: OpenSecrets"
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
