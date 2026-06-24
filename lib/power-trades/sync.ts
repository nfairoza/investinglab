import type { SupabaseClient } from "@supabase/supabase-js";
import { powerServiceClient, fmpKey, isSourceActive } from "./config";
import type { PowerTransactionType, PowerChamberOrBranch } from "./types";

// =============================================================================
// Power Trades — server-side sync for the FMP congressional source ONLY.
//
// HARD RULE: use only FMP endpoints already proven in lib/providers/congress-api
// (senate-latest, house-latest). No invented paths. Writes RAW payloads +
// NORMALIZED rows into Supabase; the UI reads the local tables, never FMP.
// =============================================================================

const FMP_BASE = "https://financialmodelingprep.com/stable";
const PARSER_VERSION = "pt-1";

async function fmpRows(endpoint: string): Promise<any[]> {
  const key = fmpKey();
  if (!key) throw new Error("FMP key not configured");
  const sep = endpoint.includes("?") ? "&" : "?";
  const r = await fetch(`${FMP_BASE}/${endpoint}${sep}apikey=${key}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`FMP HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

function mapType(raw: string): PowerTransactionType {
  const t = (raw || "").toLowerCase();
  if (t.includes("purchase") || t.includes("buy")) return "buy";
  if (t.includes("exchange")) return "exchange";
  if (t.includes("sale") || t.includes("sell")) return "sell";
  if (t.includes("option")) return "option";
  return "unknown";
}

// FMP discloses the filer's family relationship inconsistently; the row may have
// an `owner` field ("Self", "Spouse", "Joint", "Dependent", "Child"). Map it.
function mapRelationship(raw: string | undefined): string {
  const o = (raw || "").toLowerCase();
  if (!o || o.includes("self")) return "self";
  if (o.includes("spouse") || o.includes("joint")) return "spouse";
  if (o.includes("depend") || o.includes("child")) return "dependent";
  if (o.includes("trust")) return "trust";
  return "unknown";
}

// Parse an FMP amount range like "$1,001 - $15,000" into min/max numbers.
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

// A stable dedupe key: provider id if present, else the content signature.
function dedupeKey(r: any, chamber: string): string {
  if (r.transactionId) return `fmp_congress:${r.transactionId}`;
  const name = r.office || [r.firstName, r.lastName].filter(Boolean).join(" ") || "unknown";
  return [
    "fmp_congress", chamber, name.toLowerCase(),
    (r.symbol || r.assetDescription || "").toLowerCase(),
    r.transactionDate || "", r.disclosureDate || "", r.amount || "", (r.type || "").toLowerCase(),
  ].join("|");
}

// Canonicalize the display name (drop honorifics) for alias mapping.
function canonName(raw: string): string {
  return raw.replace(/^(rep\.?|sen\.?|senator|representative|the honorable)\s+/i, "").trim();
}

interface NormalizedRow {
  source: "fmp_congress";
  source_url: string | null;
  provider_record_id: string | null;
  dedupe_key: string;
  person_name: string;
  person_role: string | null;
  relationship: string;
  entity_name: string | null;
  ticker: string | null;
  asset_name: string | null;
  transaction_type: PowerTransactionType;
  transaction_date: string | null;
  disclosure_date: string | null;
  amount_min: number | null;
  amount_max: number | null;
  amount_label: string | null;
  chamber_or_branch: PowerChamberOrBranch;
  parser_version: string;
}

function normalize(r: any, chamber: "house" | "senate"): NormalizedRow {
  const personName = canonName(r.office || [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown");
  const amt = parseAmount(r.amount);
  return {
    source: "fmp_congress",
    source_url: r.link || null,
    provider_record_id: r.transactionId ? String(r.transactionId) : null,
    dedupe_key: dedupeKey(r, chamber),
    person_name: personName,
    person_role: chamber === "senate" ? "U.S. Senator" : "U.S. Representative",
    relationship: mapRelationship(r.owner),
    entity_name: r.assetDescription || null,
    ticker: r.symbol ? String(r.symbol).toUpperCase() : null,
    asset_name: r.assetDescription || r.symbol || "Undisclosed asset",
    transaction_type: mapType(r.type),
    transaction_date: isoDate(r.transactionDate),
    disclosure_date: isoDate(r.disclosureDate),
    amount_min: amt.min,
    amount_max: amt.max,
    amount_label: amt.label,
    chamber_or_branch: chamber,
    parser_version: PARSER_VERSION,
  };
}

// Upsert canonical people + aliases for a batch of normalized rows, returning a
// name→personId map. Keeps counts fresh enough for the directory.
async function upsertPeople(sb: SupabaseClient, rows: NormalizedRow[]): Promise<Map<string, string>> {
  const byName = new Map<string, NormalizedRow>();
  for (const r of rows) if (!byName.has(r.person_name.toLowerCase())) byName.set(r.person_name.toLowerCase(), r);
  const map = new Map<string, string>();

  for (const [lower, r] of byName) {
    // Find existing by canonical name (case-insensitive) or alias.
    const { data: existing } = await sb.from("power_people").select("id").ilike("canonical_name", r.person_name).maybeSingle();
    let personId = existing?.id as string | undefined;
    if (!personId) {
      const { data: ins } = await sb.from("power_people").insert({
        canonical_name: r.person_name,
        category: "congress",
        office: r.person_role,
        roles: r.person_role ? [r.person_role] : [],
        source_coverage: ["fmp_congress"],
      }).select("id").maybeSingle();
      personId = ins?.id as string | undefined;
    }
    if (personId) {
      map.set(lower, personId);
      await sb.from("power_person_aliases").upsert({ alias: lower, person_id: personId }, { onConflict: "alias" });
    }
  }
  return map;
}

// Sync the FMP congressional source: pull recent latest pages for both chambers,
// store raw, normalize, dedupe-upsert, map people, log the run.
export async function syncFmpCongress(pages = 3): Promise<{ ingested: number; normalized: number; errors: number; note?: string }> {
  const sb = powerServiceClient();
  if (!sb) return { ingested: 0, normalized: 0, errors: 1, note: "Supabase service client not configured" };
  if (!isSourceActive("fmp_congress")) return { ingested: 0, normalized: 0, errors: 0, note: "fmp_congress disabled" };

  const { data: run } = await sb.from("power_source_sync_runs").insert({ source: "fmp_congress" }).select("id").maybeSingle();
  const runId = run?.id as string | undefined;

  let ingested = 0, errors = 0;
  const normalizedRows: NormalizedRow[] = [];
  const rawRows: any[] = [];

  try {
    const reqs: Promise<{ chamber: "house" | "senate"; rows: any[] }>[] = [];
    for (let p = 0; p < pages; p++) {
      reqs.push(fmpRows(`senate-latest?page=${p}&limit=100`).then((rows) => ({ chamber: "senate" as const, rows })).catch(() => ({ chamber: "senate" as const, rows: [] })));
      reqs.push(fmpRows(`house-latest?page=${p}&limit=100`).then((rows) => ({ chamber: "house" as const, rows })).catch(() => ({ chamber: "house" as const, rows: [] })));
    }
    const results = await Promise.all(reqs);
    for (const { chamber, rows } of results) {
      for (const r of rows) {
        ingested++;
        const norm = normalize(r, chamber);
        normalizedRows.push(norm);
        rawRows.push({
          source: "fmp_congress",
          provider_record_id: norm.provider_record_id,
          person_name: norm.person_name,
          payload: r,
          parse_status: norm.ticker ? "parsed" : "partial",
          parse_note: norm.ticker ? null : "no ticker on filing",
        });
      }
    }

    // Persist raw (best-effort, capped to keep the table lean).
    if (rawRows.length) await sb.from("power_disclosures_raw").insert(rawRows.slice(0, 800)).then(() => {}, () => {});

    // People + dedupe-upsert normalized rows.
    const peopleMap = await upsertPeople(sb, normalizedRows);
    const withPerson = normalizedRows.map((n) => ({ ...n, person_id: peopleMap.get(n.person_name.toLowerCase()) ?? null }));

    // Dedupe within this batch by dedupe_key, then upsert.
    const seen = new Set<string>();
    const unique = withPerson.filter((n) => (seen.has(n.dedupe_key) ? false : (seen.add(n.dedupe_key), true)));
    if (unique.length) {
      await sb.from("power_trade_records").upsert(unique, { onConflict: "dedupe_key" });
    }

    // Refresh per-person trade counts + latest disclosure (cheap recompute).
    await refreshPersonCounts(sb);

    await sb.from("power_sources").upsert({
      source: "fmp_congress", label: "Congressional (House + Senate) via FMP",
      enabled: true, last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "source" });

    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, rows_normalized: unique.length, errors }).eq("id", runId);
    return { ingested, normalized: unique.length, errors };
  } catch (e) {
    errors++;
    const msg = e instanceof Error ? e.message : "sync failed";
    await sb.from("power_sources").upsert({ source: "fmp_congress", label: "Congressional (House + Senate) via FMP", enabled: true, last_error: msg, updated_at: new Date().toISOString() }, { onConflict: "source" }).then(() => {}, () => {});
    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, errors, note: msg }).eq("id", runId);
    return { ingested, normalized: 0, errors, note: msg };
  }
}

// Recompute trade-count windows + latest disclosure per person from the
// normalized table. Simple and correct; fine for the current data volume.
async function refreshPersonCounts(sb: SupabaseClient): Promise<void> {
  const { data: people } = await sb.from("power_people").select("id");
  if (!people) return;
  const now = Date.now();
  const d30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  const d90 = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
  const d365 = new Date(now - 365 * 86400000).toISOString().slice(0, 10);
  for (const p of people) {
    const { data: trades } = await sb.from("power_trade_records").select("disclosure_date").eq("person_id", p.id);
    const dates = (trades ?? []).map((t: any) => t.disclosure_date).filter(Boolean) as string[];
    const c = (since: string) => dates.filter((d) => d >= since).length;
    await sb.from("power_people").update({
      trade_count_30d: c(d30), trade_count_90d: c(d90), trade_count_1y: c(d365), trade_count_all: dates.length,
      latest_disclosure_date: dates.sort().slice(-1)[0] ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);
  }
}
