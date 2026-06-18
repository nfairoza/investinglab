// =============================================================================
// Committee → market-sector jurisdiction map (the "insider edge").
//
// Each committee regulates certain industries. When a member trades a stock in a
// sector their committee oversees, that's a potential informational edge. We
// match on the committee NAME (substring) so it works for both chambers and for
// renamed committees, and bucket FMP's free-text sector into our canonical set.
// =============================================================================

export type SectorBucket =
  | "Technology"
  | "Semiconductors"
  | "Defense"
  | "Healthcare"
  | "Financials"
  | "Energy"
  | "Utilities"
  | "Industrials"
  | "Communications"
  | "Materials"
  | "Real Estate"
  | "Consumer"
  | "Other";

// Normalize an FMP "sector" (and optionally industry) string into a bucket.
export function bucketSector(sector: string | null | undefined, industry?: string | null): SectorBucket {
  const s = `${sector ?? ""} ${industry ?? ""}`.toLowerCase();
  if (/semiconduct|chip|foundr/.test(s)) return "Semiconductors";
  if (/defense|aerospace|weapon|military/.test(s)) return "Defense";
  if (/health|pharma|biotech|medical|drug/.test(s)) return "Healthcare";
  if (/bank|financ|insurance|capital market|asset manage/.test(s)) return "Financials";
  if (/oil|gas|energy|petroleum|coal/.test(s)) return "Energy";
  if (/utilit|electric|water|power/.test(s)) return "Utilities";
  if (/communication|telecom|media|entertainment/.test(s)) return "Communications";
  if (/real estate|reit/.test(s)) return "Real Estate";
  if (/material|chemical|mining|metal/.test(s)) return "Materials";
  if (/industrial|machinery|transport|airline|defense/.test(s)) return "Industrials";
  if (/technology|software|information tech|internet/.test(s)) return "Technology";
  if (/consumer|retail|food|beverage|apparel|auto/.test(s)) return "Consumer";
  return "Other";
}

// Committee name patterns -> sectors they have PRIMARY regulatory oversight of.
const PRIMARY: { match: RegExp; sectors: SectorBucket[] }[] = [
  { match: /armed services/i, sectors: ["Defense", "Industrials"] },
  { match: /energy and commerce/i, sectors: ["Technology", "Semiconductors", "Communications", "Healthcare", "Energy", "Utilities"] },
  { match: /energy and natural resources/i, sectors: ["Energy", "Utilities", "Materials"] },
  { match: /\benergy\b/i, sectors: ["Energy", "Utilities"] },
  { match: /financial services/i, sectors: ["Financials", "Real Estate"] },
  { match: /\bfinance\b/i, sectors: ["Financials", "Healthcare"] }, // Senate Finance: tax, Medicare/Medicaid
  { match: /ways and means/i, sectors: ["Financials", "Healthcare"] },
  { match: /banking, housing/i, sectors: ["Financials", "Real Estate"] },
  { match: /health|education, labor/i, sectors: ["Healthcare"] },
  { match: /commerce, science/i, sectors: ["Technology", "Communications", "Semiconductors", "Industrials"] },
  { match: /science, space/i, sectors: ["Technology", "Semiconductors", "Defense"] },
  { match: /homeland security/i, sectors: ["Defense", "Technology"] },
  { match: /intelligence/i, sectors: ["Defense", "Technology", "Semiconductors"] },
  { match: /foreign (affairs|relations)/i, sectors: ["Defense"] },
  { match: /environment and public works/i, sectors: ["Energy", "Utilities", "Materials"] },
  { match: /agriculture/i, sectors: ["Materials", "Consumer"] },
  { match: /transportation|infrastructure/i, sectors: ["Industrials"] },
  { match: /natural resources/i, sectors: ["Energy", "Materials"] },
];

// Broader macro influence -> SECONDARY overlap (smaller edge).
const SECONDARY: RegExp[] = [/appropriations/i, /budget/i, /joint economic/i, /small business/i, /rules/i];

export interface SectorOverlap {
  hasConflict: boolean;
  level: "primary" | "secondary" | "none";
  committee: string | null; // the committee that creates the conflict
  rationale: string;
}

// Given a member's committees and a stock's sector bucket, find the strongest
// jurisdictional overlap.
export function findOverlap(
  committees: { name: string }[],
  sector: SectorBucket,
): SectorOverlap {
  // Primary first.
  for (const c of committees) {
    for (const rule of PRIMARY) {
      if (rule.match.test(c.name) && rule.sectors.includes(sector)) {
        return {
          hasConflict: true,
          level: "primary",
          committee: c.name,
          rationale: `${c.name} has direct regulatory oversight of the ${sector} sector.`,
        };
      }
    }
  }
  // Secondary (macro) overlap.
  for (const c of committees) {
    if (SECONDARY.some((re) => re.test(c.name))) {
      return {
        hasConflict: true,
        level: "secondary",
        committee: c.name,
        rationale: `${c.name} has broad budgetary/macro influence touching ${sector}.`,
      };
    }
  }
  return { hasConflict: false, level: "none", committee: null, rationale: "No committee overlap with this sector." };
}
