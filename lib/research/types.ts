// Shape of a generated research memo. Mirrors the `report` jsonb column in
// public.research_reports, and follows the spec's section list A–P.
//
// Every section carries BOTH a "pro" string and a plain-English "beginner"
// string so the "Explain Like I'm New" toggle just swaps which field it shows.

export type Rating =
  | "Buy"
  | "Buy gradually"
  | "Hold"
  | "Wait"
  | "Avoid"
  | "Sell";

export interface ResearchSection {
  id: string; // "A".."P"
  title: string;
  pro: string; // analyst-level text
  beginner: string; // plain-English version of the same point
}

export interface Scenario {
  label: "Bull" | "Base" | "Bear" | "Severe Downside";
  probabilityPct: number | null;
  impliedPriceLow: number | null;
  impliedPriceHigh: number | null;
  expectedReturnPct: number | null;
  assumptions: string;
}

// The 16-field action table the spec requires at the end of every stock page.
// All strings so we can show ranges / "—" without faking precision.
export interface ActionTable {
  currentPrice: string;
  costBasis: string;
  gainLoss: string;
  fairValueRange: string;
  addBelow: string;
  trimAbove: string;
  sellInvalidation: string;
  upsidePotential: string;
  downsideRisk: string;
  riskReward: string;
  finalAction: string;
  confidence: string;
  mainReason: string;
  biggestRisk: string;
  nextCatalyst: string;
  dataAsOf: string;
}

export interface ResearchReport {
  symbol: string;
  rating: Rating;
  confidence: number; // 0..100 — shown next to the rating, never hidden
  oneLineThesis: string;
  biggestRisk: string; // the single most important risk, surfaced up top
  sections: ResearchSection[]; // A..P (see SECTION_PLAN)
  scenarios: Scenario[]; // Bull / Base / Bear / Severe Downside
  actionTable: ActionTable;
  // provenance
  dataAsOf: string; // ISO 8601 — the market data the memo was built from
  generatedAt: string; // ISO 8601 — when the memo was produced
}

// The canonical A–P section list from the spec, used to prompt the model.
export const SECTION_PLAN: { id: string; title: string }[] = [
  { id: "A", title: "Executive Summary" },
  { id: "B", title: "Final Rating" },
  { id: "C", title: "Current Market Data" },
  { id: "D", title: "Business Overview" },
  { id: "E", title: "Investment Thesis" },
  { id: "F", title: "Financial Analysis" },
  { id: "G", title: "Growth Sustainability" },
  { id: "H", title: "Valuation Analysis" },
  { id: "I", title: "Reverse DCF: What Is Priced In?" },
  { id: "J", title: "Technical Setup & Entry Timing" },
  { id: "K", title: "Sentiment & Catalysts (3/6/12/24/36 months)" },
  { id: "L", title: "Full Risk Register" },
  { id: "M", title: "Scenarios: Bull / Base / Bear / Severe Downside" },
  { id: "N", title: "Probability-Weighted Expected Return" },
  { id: "O", title: "Portfolio Action Plan" },
  { id: "P", title: "Final Verdict" },
];
