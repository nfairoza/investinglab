import type { SupabaseClient } from "@supabase/supabase-js";
import { powerServiceClient, isSourceActive } from "./config";
import { refreshPersonCounts } from "./sync";
import type { PowerTransactionType } from "./types";

// =============================================================================
// Power Trades — Executive branch / OGE disclosures (Phase 3).
//
// HONEST REALITY: there is NO clean public API for executive-branch financial
// disclosures. They are OGE Form 278e (annual) and 278-T (periodic transaction)
// reports, published as PDFs and searched on oge.gov. So this phase is NOT bulk
// ingestion — it is:
//   (a) a curated directory of high-profile officials → power_people (executive),
//       each linked to a REAL OGE source (the public disclosure search), and
//   (b) an admin manual-entry path for notable 278-T transactions, each REQUIRING
//       a real oge.gov source URL.
//
// HARD RULE (no hallucination):
//   - Link only to verified-real OGE pages. We do NOT invent per-filer deep
//     links or document IDs. Each official links to OGE's public search; an admin
//     may attach a verified deep link later via `verifiedOgeUrl`.
//   - Never fabricate a disclosure, holding, amount, or date. Curated officials
//     carry identity facts ONLY — zero trade rows are created from this list.
//   - Manual records are rejected unless they carry an oge.gov source URL.
//   - Respect OGE privacy design: never store/derive family-member names,
//     account numbers, or addresses.
// =============================================================================

// Guaranteed-real OGE entry point. The public "Officials' Individual Disclosures
// Search Collection" lives on oge.gov; we link to the site root rather than guess
// a fragile deep path, per the no-hallucination rule.
export const OGE_PUBLIC_SEARCH = "https://www.oge.gov/";
const PARSER_VERSION = "pt-executive-1";

export interface ExecutiveOfficial {
  canonicalName: string;
  aliases?: string[];
  office: string;          // role/title
  party?: string;
  state?: string;
  // A verified deep link to this filer's OGE document/page, ONLY if confirmed.
  // Left undefined → we link to OGE_PUBLIC_SEARCH instead of guessing.
  verifiedOgeUrl?: string;
}

// Curated set of high-profile, Senate-confirmed / Presidentially-appointed
// officials whose 278e/278-T reports OGE publishes. Identity facts only.
export const EXECUTIVE_OFFICIALS: ExecutiveOfficial[] = [
  { canonicalName: "Donald Trump", aliases: ["trump", "president trump", "donald j trump"], office: "President of the United States", party: "R" },
  { canonicalName: "JD Vance", aliases: ["vance", "j d vance", "j.d. vance"], office: "Vice President of the United States", party: "R" },
  { canonicalName: "Marco Rubio", aliases: ["rubio"], office: "Secretary of State", party: "R" },
  { canonicalName: "Scott Bessent", aliases: ["bessent"], office: "Secretary of the Treasury", party: "R" },
  { canonicalName: "Pete Hegseth", aliases: ["hegseth"], office: "Secretary of Defense", party: "R" },
  { canonicalName: "Pam Bondi", aliases: ["bondi"], office: "Attorney General", party: "R" },
  { canonicalName: "Howard Lutnick", aliases: ["lutnick"], office: "Secretary of Commerce", party: "R" },
  { canonicalName: "Robert F. Kennedy Jr.", aliases: ["kennedy", "rfk", "rfk jr"], office: "Secretary of Health and Human Services", party: "R" },
];

export function ogeLinkFor(o: ExecutiveOfficial): string {
  return o.verifiedOgeUrl ?? OGE_PUBLIC_SEARCH;
}

// Match a curated official by name/alias (case-insensitive substring).
export function matchExecutiveOfficials(q: string): ExecutiveOfficial[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  return EXECUTIVE_OFFICIALS.filter((o) =>
    o.canonicalName.toLowerCase().includes(n) || (o.aliases ?? []).some((a) => a.includes(n) || n.includes(a)),
  );
}

// Upsert the curated officials as power_people (executive). NO trade rows are
// created — these are directory entries with a verified OGE source link.
export async function syncExecutiveDirectory(): Promise<{ ingested: number; normalized: number; errors: number; note?: string }> {
  const sb = powerServiceClient();
  if (!sb) return { ingested: 0, normalized: 0, errors: 1, note: "Supabase service client not configured" };
  if (!isSourceActive("executive_oge")) return { ingested: 0, normalized: 0, errors: 0, note: "executive_oge disabled" };

  const { data: run } = await sb.from("power_source_sync_runs").insert({ source: "executive_oge" }).select("id").maybeSingle();
  const runId = run?.id as string | undefined;

  let ingested = 0, errors = 0;
  try {
    for (const o of EXECUTIVE_OFFICIALS) {
      ingested++;
      const lower = o.canonicalName.toLowerCase();
      const { data: existing } = await sb.from("power_people").select("id, identifiers, source_coverage").ilike("canonical_name", o.canonicalName).maybeSingle();
      let personId = existing?.id as string | undefined;
      const identifiers = { ...(existing?.identifiers ?? {}), ogeUrl: ogeLinkFor(o) };
      const coverage = Array.from(new Set([...(existing?.source_coverage ?? []), "executive_oge"]));
      if (!personId) {
        const { data: ins, error } = await sb.from("power_people").insert({
          canonical_name: o.canonicalName,
          category: "executive",
          party: o.party ?? null,
          state: o.state ?? null,
          office: o.office,
          roles: [o.office],
          identifiers,
          source_coverage: coverage,
        }).select("id").maybeSingle();
        if (error) { errors++; continue; }
        personId = ins?.id as string | undefined;
      } else {
        await sb.from("power_people").update({ office: o.office, party: o.party ?? null, identifiers, source_coverage: coverage, updated_at: new Date().toISOString() }).eq("id", personId);
      }
      if (personId) {
        await sb.from("power_person_aliases").upsert({ alias: lower, person_id: personId }, { onConflict: "alias" });
        for (const a of o.aliases ?? []) await sb.from("power_person_aliases").upsert({ alias: a, person_id: personId }, { onConflict: "alias" });
      }
    }

    await sb.from("power_sources").upsert({
      source: "executive_oge", label: "Executive / OGE disclosures (partial · curated)",
      enabled: true, last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "source" });

    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, rows_normalized: 0, errors, note: "curated directory only — no trade rows" }).eq("id", runId);
    return { ingested, normalized: 0, errors, note: `${EXECUTIVE_OFFICIALS.length} officials curated` };
  } catch (e) {
    errors++;
    const msg = e instanceof Error ? e.message : "sync failed";
    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, errors, note: msg }).eq("id", runId);
    return { ingested, normalized: 0, errors, note: msg };
  }
}

// ---- Admin manual entry of a notable 278-T transaction ----------------------

export interface ManualExecutiveRecord {
  personName: string;
  office?: string;
  ticker?: string;
  assetName?: string;
  transactionType?: PowerTransactionType;
  transactionDate?: string;     // YYYY-MM-DD
  disclosureDate?: string;      // YYYY-MM-DD
  amountLabel?: string;         // e.g. "$1,001 - $15,000"
  sourceUrl: string;            // REQUIRED — must be an oge.gov document/page
}

// Privacy guard: reject any field that smells like a family name or address.
// We never store dependents/addresses (OGE form omits them by design).
function looksLikeDisallowed(v: string | undefined): boolean {
  if (!v) return false;
  return /\b(spouse|wife|husband|son|daughter|child|dependent)\b/i.test(v) || /\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive)\b/i.test(v);
}

export function isValidOgeUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return /(^|\.)oge\.gov$/i.test(u.hostname) && (u.protocol === "https:" || u.protocol === "http:");
  } catch {
    return false;
  }
}

function parseAmount(label: string | undefined): { min: number | null; max: number | null; label: string | null } {
  if (!label) return { min: null, max: null, label: null };
  const nums = (label.match(/[\d,]+/g) ?? []).map((n) => Number(n.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
  return { min: nums[0] ?? null, max: nums[1] ?? nums[0] ?? null, label };
}
function isoDate(s: string | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Validate + normalize + dedupe-upsert a single manually-entered executive
// transaction. Returns an error string when rejected (no DB write).
export async function addManualExecutiveRecord(rec: ManualExecutiveRecord): Promise<{ ok: boolean; error?: string; id?: string }> {
  const sb = powerServiceClient();
  if (!sb) return { ok: false, error: "Supabase service client not configured" };
  if (!isSourceActive("executive_oge")) return { ok: false, error: "executive_oge source is disabled" };

  if (!rec.personName?.trim()) return { ok: false, error: "personName is required" };
  if (!isValidOgeUrl(rec.sourceUrl)) return { ok: false, error: "A valid oge.gov source URL is required for any executive record" };
  if (looksLikeDisallowed(rec.personName) || looksLikeDisallowed(rec.assetName) || looksLikeDisallowed(rec.office)) {
    return { ok: false, error: "Rejected: family-member names and addresses must not be entered (OGE privacy design)" };
  }

  const name = rec.personName.trim();
  // Link to an existing person (by name/alias) or create the executive person.
  const { data: existing } = await sb.from("power_people").select("id").ilike("canonical_name", name).maybeSingle();
  let personId = existing?.id as string | undefined;
  if (!personId) {
    const { data: ins } = await sb.from("power_people").insert({
      canonical_name: name, category: "executive", office: rec.office ?? null,
      roles: rec.office ? [rec.office] : [], source_coverage: ["executive_oge"],
      identifiers: { ogeUrl: rec.sourceUrl },
    }).select("id").maybeSingle();
    personId = ins?.id as string | undefined;
    if (personId) await sb.from("power_person_aliases").upsert({ alias: name.toLowerCase(), person_id: personId }, { onConflict: "alias" });
  }

  const amt = parseAmount(rec.amountLabel);
  const txDate = isoDate(rec.transactionDate);
  const dedupeKey = ["executive_oge", name.toLowerCase(), (rec.ticker || rec.assetName || "").toLowerCase(), txDate || "", (rec.transactionType || "")].join("|");

  const row = {
    source: "executive_oge",
    source_url: rec.sourceUrl,
    provider_record_id: null,
    dedupe_key: dedupeKey,
    person_id: personId ?? null,
    person_name: name,
    person_role: rec.office ?? null,
    relationship: "self",
    entity_name: rec.assetName ?? null,
    ticker: rec.ticker ? rec.ticker.toUpperCase() : null,
    asset_name: rec.assetName ?? rec.ticker ?? "Disclosed asset",
    transaction_type: rec.transactionType ?? "unknown",
    transaction_date: txDate,
    disclosure_date: isoDate(rec.disclosureDate),
    amount_min: amt.min,
    amount_max: amt.max,
    amount_label: amt.label,
    filing_type: "278-T",
    chamber_or_branch: "executive",
    tags: ["manual_entry", "verified_source"],
    parser_version: PARSER_VERSION,
  };

  const { data: up, error } = await sb.from("power_trade_records").upsert(row, { onConflict: "dedupe_key" }).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };

  // Keep a raw audit trail of the manual entry + its source link.
  await sb.from("power_disclosures_raw").insert({
    source: "executive_oge", provider_record_id: null, person_name: name,
    payload: { manual: true, sourceUrl: rec.sourceUrl, input: rec }, parse_status: "parsed", parse_note: "admin manual entry (278-T) with verified OGE source",
  }).then(() => {}, () => {});

  await refreshPersonCounts(sb);
  return { ok: true, id: up?.id as string | undefined };
}
