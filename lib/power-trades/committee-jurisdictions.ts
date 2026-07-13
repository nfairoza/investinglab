// =============================================================================
// PT4 — committee jurisdiction overlap for Power Trades.
//
// Reuses the hand-authored committee→GICS-sector map + bucketing already proven
// in the Alpha-Feed scorer (lib/congress/sectors.ts) so there is ONE source of
// truth for "which committee regulates which sector" (conservative mappings,
// one comment per rule, see that file). This module adds the power-trades glue:
// turn a member's committees + a traded ticker's sector into a flag + chip.
// Pure and deterministic — golden-tested; the nightly job feeds it real data.
// =============================================================================

import { bucketSector, findOverlap, type SectorBucket } from "@/lib/congress/sectors";

export interface CommitteeOverlap {
  overlap: boolean;
  level: "primary" | "secondary" | "none";
  committee: string | null; // the committee creating the overlap
  sector: SectorBucket;
}

// Given a member's committees and a stock's raw sector/industry strings, decide
// whether the trade falls within the member's committee jurisdiction.
export function computeCommitteeOverlap(
  committees: { name: string }[],
  sector: string | null | undefined,
  industry?: string | null,
): CommitteeOverlap {
  const bucket = bucketSector(sector, industry);
  const o = findOverlap(committees, bucket);
  return { overlap: o.hasConflict, level: o.level, committee: o.committee, sector: bucket };
}

// Short chip label, e.g. "Armed Services" from "Senate Committee on Armed
// Services" — the committee word without the chamber/"Committee on" boilerplate.
export function committeeChipLabel(name: string | null): string {
  if (!name) return "";
  return name
    .replace(/^(Senate|House|Joint)\s+(Permanent\s+)?(Select\s+)?(Special\s+)?Committee\s+on\s+/i, "")
    .replace(/^(Senate|House)\s+/i, "")
    .trim();
}
