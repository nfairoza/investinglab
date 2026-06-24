import type { PowerPersonCategory, PowerTradeSource } from "./types";

// =============================================================================
// Known power players — a curated, FACTUAL roster of well-known public figures
// so the People Directory can answer a search for "Trump", "a cabinet official",
// "a CEO", "a lobbyist" with an HONEST profile + reason, even when the person has
// zero parsed trade rows in the currently enabled sources.
//
// HARD RULE (no hallucination): these entries carry only public, verifiable
// identity facts (name, category, role, the source category that WOULD cover
// them). They NEVER carry trade data. A seed person always shows zero counts and
// an empty-state reason derived from which sources are actually enabled. We do
// not invent filings, amounts, or holdings.
//
// The list is intentionally small + representative — it is a "you can search for
// these kinds of people" affordance, not a claim of comprehensive coverage.
// =============================================================================

export interface KnownPerson {
  canonicalName: string;
  aliases?: string[];
  category: PowerPersonCategory;
  role: string;
  party?: string;
  state?: string;
  // The source category that would carry this person's trade/holding disclosures
  // (if/when it is enabled). Used to compute the honest empty-state reason.
  coveredBySource: PowerTradeSource;
}

export const KNOWN_PEOPLE: KnownPerson[] = [
  // --- Congress (covered by the enabled FMP congressional source) -----------
  { canonicalName: "Nancy Pelosi", aliases: ["pelosi", "paul pelosi"], category: "congress", role: "U.S. Representative", party: "D", state: "CA", coveredBySource: "fmp_congress" },
  { canonicalName: "Ro Khanna", aliases: ["khanna"], category: "congress", role: "U.S. Representative", party: "D", state: "CA", coveredBySource: "fmp_congress" },
  { canonicalName: "Michael McCaul", aliases: ["mccaul"], category: "congress", role: "U.S. Representative", party: "R", state: "TX", coveredBySource: "fmp_congress" },
  { canonicalName: "Tommy Tuberville", aliases: ["tuberville"], category: "congress", role: "U.S. Senator", party: "R", state: "AL", coveredBySource: "fmp_congress" },
  { canonicalName: "Dan Crenshaw", aliases: ["crenshaw"], category: "congress", role: "U.S. Representative", party: "R", state: "TX", coveredBySource: "fmp_congress" },

  // --- Executive branch (covered only when Executive/OGE source is enabled) --
  { canonicalName: "Donald Trump", aliases: ["trump", "president trump", "donald j trump"], category: "executive", role: "President of the United States", coveredBySource: "executive_oge" },
  { canonicalName: "JD Vance", aliases: ["vance", "j d vance", "j.d. vance"], category: "executive", role: "Vice President of the United States", coveredBySource: "executive_oge" },
  { canonicalName: "Scott Bessent", aliases: ["bessent"], category: "executive", role: "Secretary of the Treasury", coveredBySource: "executive_oge" },
  { canonicalName: "Marco Rubio", aliases: ["rubio"], category: "executive", role: "Secretary of State", coveredBySource: "executive_oge" },

  // --- Corporate insiders (covered only when SEC Form 4 is enabled) ----------
  { canonicalName: "Elon Musk", aliases: ["musk"], category: "corporate_insider", role: "CEO / director / 10% owner (multiple issuers)", coveredBySource: "sec_form_4" },
  { canonicalName: "Tim Cook", aliases: ["cook", "timothy cook"], category: "corporate_insider", role: "CEO, Apple Inc.", coveredBySource: "sec_form_4" },
  { canonicalName: "Jensen Huang", aliases: ["huang", "jensen"], category: "corporate_insider", role: "CEO, NVIDIA Corp.", coveredBySource: "sec_form_4" },
  { canonicalName: "Jamie Dimon", aliases: ["dimon"], category: "corporate_insider", role: "CEO, JPMorgan Chase", coveredBySource: "sec_form_4" },
  { canonicalName: "Mark Zuckerberg", aliases: ["zuckerberg"], category: "corporate_insider", role: "CEO / director, Meta Platforms", coveredBySource: "sec_form_4" },

  // --- Influence people (campaign-finance / lobbying CONTEXT, never trades) --
  { canonicalName: "George Soros", aliases: ["soros"], category: "donor", role: "Major political donor", coveredBySource: "fec" },
  { canonicalName: "Charles Koch", aliases: ["koch", "charles g koch"], category: "donor", role: "Major political donor", coveredBySource: "fec" },
];

// Match a known person by canonical name or alias (case-insensitive substring).
export function matchKnownPeople(q: string): KnownPerson[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return KNOWN_PEOPLE.filter((p) =>
    p.canonicalName.toLowerCase().includes(needle) ||
    (p.aliases ?? []).some((a) => a.includes(needle) || needle.includes(a)),
  );
}
