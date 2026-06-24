import { NextRequest, NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { powerServiceClient, isSourceActive } from "@/lib/power-trades/config";
import { matchKnownPeople, KNOWN_PEOPLE, type KnownPerson } from "@/lib/power-trades/known-people";
import type { PowerTradeSource } from "@/lib/power-trades/types";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  fmp_congress: "Congressional disclosures",
  executive_oge: "Executive / OGE disclosures",
  sec_form_4: "SEC Form 4 corporate-insider filings",
  fec: "FEC campaign-finance data",
  opensecrets: "OpenSecrets lobbying data",
};

// Honest empty-state reason for a known person with no parsed rows, based on
// whether the source that WOULD cover them is actually enabled.
function emptyReason(p: KnownPerson): string {
  const label = SOURCE_LABEL[p.coveredBySource] ?? "the relevant source";
  if (!isSourceActive(p.coveredBySource)) {
    if (p.coveredBySource === "fec" || p.coveredBySource === "opensecrets") {
      return `${label} is not enabled yet. ${p.canonicalName} may have campaign-finance or lobbying records (influence context), but those are never shown as stock trades.`;
    }
    return `${label} is not enabled yet, so no trade records are available for ${p.canonicalName}. Other enabled sources do not cover this person.`;
  }
  return `No parsed trades found in this window. Try 1yr, All-time, or Raw Disclosures.`;
}

// Shape a known person into the same row shape the directory renders, with zero
// counts (NEVER fabricated) + an honest reason + source-coverage flags.
function synthRow(p: KnownPerson) {
  return {
    id: `known:${p.canonicalName.toLowerCase().replace(/\s+/g, "-")}`,
    canonical_name: p.canonicalName,
    category: p.category,
    party: p.party ?? null,
    state: p.state ?? null,
    office: p.role,
    roles: [p.role],
    source_coverage: [] as PowerTradeSource[],
    covered_by_source: p.coveredBySource,
    source_enabled: isSourceActive(p.coveredBySource),
    latest_disclosure_date: null,
    trade_count_30d: 0, trade_count_90d: 0, trade_count_1y: 0, trade_count_all: 0,
    in_current_feed: false,
    empty_reason: emptyReason(p),
    is_known_seed: true,
  };
}

// GET /api/power-trades/people — People Directory.
// Merges (a) people with parsed records in the local table with (b) a curated
// roster of known public figures so a search for someone outside the enabled
// sources still returns an honest profile + reason instead of nothing.
// ?q=&category=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = powerServiceClient();
  if (!sb) return NextResponse.json({ rows: [], note: "not_configured" });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const category = sp.get("category");
  const limit = Math.min(Number(sp.get("limit")) || 100, 300);

  let query = sb.from("power_people").select("*").order("trade_count_all", { ascending: false }).limit(limit);
  if (category && category !== "all") query = query.eq("category", category);
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ rows: [], error: error.message }, { status: 500 });

  const dbRows = (data ?? []).map((r: any) => ({ ...r, in_current_feed: (r.trade_count_all ?? 0) > 0, is_known_seed: false }));
  const dbNames = new Set(dbRows.map((r: any) => String(r.canonical_name).toLowerCase()));

  // Seed people to merge in: search matches when querying, else the whole roster
  // (filtered by category). Skip anyone already present in the DB rows.
  let seed: KnownPerson[] = q ? matchKnownPeople(q) : KNOWN_PEOPLE;
  if (category && category !== "all") seed = seed.filter((p) => p.category === category);
  const seedRows = seed.filter((p) => !dbNames.has(p.canonicalName.toLowerCase())).map(synthRow);

  // DB rows (real records) first, then seed profiles.
  return NextResponse.json({ rows: [...dbRows, ...seedRows] });
}
