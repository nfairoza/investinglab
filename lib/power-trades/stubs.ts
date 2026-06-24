import type { PowerTradeSource } from "./types";

// =============================================================================
// Stubbed, DISABLED adapters for future Power Trades sources. Each is a one-file
// drop-in point. They are NOT implemented this phase and MUST NOT fabricate any
// data. When a source is built, replace its `sync()` with a real implementation
// (verifying every endpoint/field against the provider's live docs first) and
// flip the corresponding env flag in lib/power-trades/config.ts.
// =============================================================================

export interface StubAdapter {
  source: PowerTradeSource;
  // Verify-before-build note so nobody enables an unbuilt source.
  todo: string;
  sync(): Promise<{ ingested: number; normalized: number; errors: number; note: string }>;
}

function notBuilt(source: PowerTradeSource, todo: string): StubAdapter {
  return {
    source,
    todo,
    async sync() {
      return { ingested: 0, normalized: 0, errors: 0, note: `${source} adapter not built yet — ${todo}` };
    },
  };
}

// OPTIONAL future drop-in. Verify Quiver pricing/access/history/rate-limits/
// redistribution rights directly from Quiver before building or enabling.
export const quiverStub = notBuilt("quiver", "TODO: verify Quiver API terms + endpoints/fields against Quiver docs");

// Phase 2 — BUILT. SEC Form 4 (EDGAR) corporate insiders now lives in
// lib/power-trades/sec-form4.ts (syncSecForm4). No stub here anymore.

// Phase 3 — BUILT (partial · curated). Executive / OGE disclosures now live in
// lib/power-trades/executive.ts (syncExecutiveDirectory + addManualExecutiveRecord).
// No bulk PDF parsing; curated directory + admin manual entry with verified links.

// Phase 4 — BUILT (influence context, NOT trades). FEC (OpenFEC) + OpenSecrets
// now live in lib/power-trades/influence.ts (syncFec + syncOpenSecrets), writing
// to power_influence_records (separate from trades). No stubs here anymore.

export const stubAdapters: StubAdapter[] = [quiverStub];
