import type { CongressTrade } from "@/lib/providers/types";
import type { SectorBucket, SectorOverlap } from "./sectors";

// =============================================================================
// Deterministic conviction scoring for congressional trades (0–100).
//
// Transparent, rules-based — NOT an AI guess. The AI is used only to write the
// thesis narrative and (when no real options feed exists) an ESTIMATED options
// read. The score breaks down into vectors the user can inspect.
//
// Vectors (max points):
//   Capital scale ........ 25  (from the disclosed dollar bracket)
//   Legislative edge ..... 40  (committee jurisdiction over the stock's sector)
//   Cluster signal ....... 20  (multiple members same ticker/direction in 14d)
//   Options proxy ........ 15  (AI-estimated alignment; 0 until filled)
// Without the options vector the ceiling is 85 — flagged in the result.
// =============================================================================

export type OptionsValidation = "BULLISH" | "BEARISH" | "NEUTRAL";
export type PriorityTier = "HIGH" | "MEDIUM" | "LOW";

export interface ScoreBreakdown {
  capital: number;
  edge: number;
  cluster: number;
  options: number;
}

export interface ScoredTrade {
  id: string;
  ticker: string | null;
  companyName: string;
  representative: string;
  chamber: "House" | "Senate";
  party: string; // D/R/I or ""
  action: "BUY" | "SELL";
  sizeTranche: string; // the disclosed bracket
  sector: SectorBucket;
  committeeTag: string | null; // conflicting committee, or null
  conflictLevel: "primary" | "secondary" | "none";
  conflictRationale: string;
  clusterCount: number; // how many members traded this ticker same dir in window
  clusterCrossParty: boolean;
  optionsValidation: OptionsValidation; // estimated unless a real feed is added
  optionsEstimated: boolean;
  convictionScore: number;
  maxPossible: number; // 85 when options not yet filled, else 100
  tier: PriorityTier;
  breakdown: ScoreBreakdown;
  txDate: string;
  disclosureDate: string;
  sourceLink: string | null;
  thesis: string; // filled by AI later; "" until then
}

// Parse a disclosed bracket like "$100,001 - $250,000" into its lower bound $.
export function bracketLow(amountRange: string): number {
  const nums = (amountRange.match(/[\d,]+/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
  return nums.length ? Math.min(...nums) : 0;
}

function capitalPoints(amountRange: string): number {
  const low = bracketLow(amountRange);
  if (low > 500_000) return 25;
  if (low > 100_000) return 20;
  if (low > 15_000) return 10;
  return 0;
}

function edgePoints(overlap: SectorOverlap): number {
  if (overlap.level === "primary") return 40;
  if (overlap.level === "secondary") return 15;
  return 0;
}

// Cluster: 0 for a lone trade, scaling up; cross-party adds a bonus.
function clusterPoints(count: number, crossParty: boolean): number {
  if (count <= 1) return 0;
  let pts = count >= 4 ? 14 : count === 3 ? 11 : 8; // 2,3,4+
  if (crossParty) pts += 6;
  return Math.min(20, pts);
}

function tierFor(score: number): PriorityTier {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export interface ScoreInputs {
  trade: CongressTrade;
  companyName: string;
  sector: SectorBucket;
  overlap: SectorOverlap;
  party: string;
  clusterCount: number;
  clusterCrossParty: boolean;
  // Optional options read (estimated by AI, or real if a feed is wired later).
  options?: { validation: OptionsValidation; aligned: boolean; estimated: boolean };
}

export function scoreTrade(inp: ScoreInputs): ScoredTrade {
  const { trade, sector, overlap } = inp;
  const action: "BUY" | "SELL" = trade.type === "buy" ? "BUY" : "SELL";

  const capital = capitalPoints(trade.amountRange);
  const cluster = clusterPoints(inp.clusterCount, inp.clusterCrossParty);

  // A small (<$15k) trade is low-conviction on its own — members report a lot of
  // routine retail-size positions. Committee edge only counts in FULL when the
  // member put real money in OR others are trading the same name (clustering
  // corroborates it). Otherwise we halve the edge so a lone tiny trade stays LOW
  // instead of riding committee overlap up to MEDIUM.
  const isSmall = bracketLow(trade.amountRange) < 15_000;
  const corroborated = inp.clusterCount > 1;
  const rawEdge = edgePoints(overlap);
  const edge = isSmall && !corroborated ? Math.round(rawEdge / 2) : rawEdge;

  // Options vector: only credited when an aligned read exists. Up to 15.
  let options = 0;
  const optionsFilled = Boolean(inp.options);
  if (inp.options?.aligned) options = inp.options.estimated ? 10 : 15;

  const convictionScore = Math.min(100, capital + edge + cluster + options);
  const maxPossible = optionsFilled ? 100 : 85;

  return {
    id: trade.id,
    ticker: trade.symbol,
    companyName: inp.companyName || trade.asset,
    representative: trade.member,
    chamber: trade.chamber,
    party: inp.party,
    action,
    sizeTranche: trade.amountRange,
    sector,
    committeeTag: overlap.committee,
    conflictLevel: overlap.level,
    conflictRationale: overlap.rationale,
    clusterCount: inp.clusterCount,
    clusterCrossParty: inp.clusterCrossParty,
    optionsValidation: inp.options?.validation ?? "NEUTRAL",
    optionsEstimated: inp.options?.estimated ?? true,
    convictionScore,
    maxPossible,
    tier: tierFor(convictionScore),
    breakdown: { capital, edge, cluster, options },
    txDate: trade.txDate,
    disclosureDate: trade.disclosureDate,
    sourceLink: trade.sourceLink,
    thesis: "",
  };
}

// Detect clusters: group trades by ticker+direction within a rolling window.
// Returns, per trade id, the count of DISTINCT members and whether cross-party.
export function computeClusters(
  trades: CongressTrade[],
  partyOf: (t: CongressTrade) => string,
  windowDays = 14,
): Map<string, { count: number; crossParty: boolean }> {
  const out = new Map<string, { count: number; crossParty: boolean }>();
  const byKey = new Map<string, CongressTrade[]>();
  for (const t of trades) {
    if (!t.symbol) continue;
    const key = `${t.symbol}|${t.type}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(t);
  }
  const dayMs = 86_400_000;
  for (const [, group] of byKey) {
    for (const t of group) {
      const tTime = new Date(t.txDate || t.disclosureDate).getTime();
      const members = new Set<string>();
      const parties = new Set<string>();
      for (const o of group) {
        const oTime = new Date(o.txDate || o.disclosureDate).getTime();
        if (Number.isNaN(tTime) || Number.isNaN(oTime) || Math.abs(oTime - tTime) <= windowDays * dayMs) {
          members.add(o.member);
          const p = partyOf(o);
          if (p) parties.add(p);
        }
      }
      out.set(t.id, { count: members.size, crossParty: parties.size >= 2 });
    }
  }
  return out;
}
