import type { SupabaseClient } from "@supabase/supabase-js";
import { powerServiceClient, isSourceActive, fecKey } from "./config";

// =============================================================================
// Power Trades — Influence Context (FEC). NOT TRADES.
//
// Campaign finance is money/influence context, never buy/sell rows. It lands in
// power_influence_records (separate table) and a separate UI.
//
// HARD RULE (no hallucination): only documented provider endpoints + fields are
// used. Anything unverifiable → an honest error/empty state, never fabricated.
//
// PRIVACY: we use AGGREGATION endpoints (by employer / by state), NOT individual
// itemized donor rows — so we never store or display individual donor street
// addresses. FEC contributor lists are non-commercial use only.
//
// Verified endpoints — FEC (api.open.fec.gov, api.data.gov key):
//   /v1/candidates/search                  → resolve a name → candidate_id + committees
//   /v1/schedules/schedule_a/by_employer/  → top employers of donors to a committee
//   /v1/schedules/schedule_a/by_state/     → donor totals by state
//
// OpenSecrets discontinued its PUBLIC API on 2025-04-15 (see syncOpenSecrets);
// no lobbying source is available.
// =============================================================================

const FEC_BASE = "https://api.open.fec.gov/v1";
const PARSER_VERSION = "pt-influence-1";

type SyncResult = { ingested: number; normalized: number; errors: number; note?: string };

interface InfluenceRow {
  source: "fec" | "opensecrets";
  record_type: string;
  source_url: string;
  provider_record_id: string | null;
  dedupe_key: string;
  person_id: string | null;
  subject_name: string;
  counterparty_name: string | null;
  city: string | null;
  state: string | null;
  employer: string | null;
  occupation: string | null;
  amount: number | null;
  amount_label: string | null;
  cycle_or_year: string | null;
  issue_or_industry: string | null;
  attribution: string | null;
  parser_version: string;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function moneyLabel(n: number | null): string | null {
  if (n == null) return null;
  return `$${Math.round(n).toLocaleString()}`;
}

// People we contextualize. Kept small + congressional (FMP source covers them),
// so FEC/OpenSecrets enrich existing power_people rather than inventing figures.
// state is required for OpenSecrets getLegislators CID resolution.
const SEED_OFFICIALS: { name: string; state: string }[] = [
  { name: "Nancy Pelosi", state: "CA" },
  { name: "Ro Khanna", state: "CA" },
  { name: "Tommy Tuberville", state: "AL" },
  { name: "Michael McCaul", state: "TX" },
];

async function linkPersonId(sb: SupabaseClient, name: string): Promise<string | null> {
  const { data } = await sb.from("power_people").select("id").ilike("canonical_name", name).maybeSingle();
  return (data?.id as string) ?? null;
}

// ── FEC ──────────────────────────────────────────────────────────────────────

async function fecJson(path: string, params: Record<string, string>): Promise<any> {
  const key = fecKey();
  if (!key) throw new Error("FEC_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, api_key: key }).toString();
  const r = await fetch(`${FEC_BASE}${path}?${qs}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`OpenFEC HTTP ${r.status}`);
  return r.json();
}

// FEC public UI link for a committee's receipts (real, stable path).
function fecCommitteeUrl(committeeId: string): string {
  return `https://www.fec.gov/data/committee/${committeeId}/`;
}

export async function syncFec(): Promise<SyncResult> {
  const sb = powerServiceClient();
  if (!sb) return { ingested: 0, normalized: 0, errors: 1, note: "Supabase service client not configured" };
  if (!isSourceActive("fec")) return { ingested: 0, normalized: 0, errors: 0, note: "fec disabled" };
  if (!fecKey()) return { ingested: 0, normalized: 0, errors: 1, note: "FEC_API_KEY not configured" };

  const { data: run } = await sb.from("power_source_sync_runs").insert({ source: "fec" }).select("id").maybeSingle();
  const runId = run?.id as string | undefined;
  let ingested = 0, errors = 0;
  const rows: InfluenceRow[] = [];

  try {
    for (const off of SEED_OFFICIALS) {
      try {
        // 1. Resolve the candidate + their principal committee.
        const cand = await fecJson("/candidates/search/", { q: off.name, per_page: "1", sort: "-election_years" });
        const c = cand?.results?.[0];
        if (!c?.candidate_id) continue;
        const personId = await linkPersonId(sb, off.name);
        // Persist the FEC candidate id on the person for future runs.
        if (personId) {
          const { data: p } = await sb.from("power_people").select("identifiers").eq("id", personId).maybeSingle();
          await sb.from("power_people").update({ identifiers: { ...(p?.identifiers ?? {}), fecCandidateId: c.candidate_id }, updated_at: new Date().toISOString() }).eq("id", personId);
        }
        const committeeId: string | undefined = c.principal_committees?.[0]?.committee_id ?? c.committee_id;
        if (!committeeId) continue;

        // 2. Aggregated donor EMPLOYERS (org-level, NO individual addresses).
        ingested++;
        const byEmp = await fecJson("/schedules/schedule_a/by_employer/", { committee_id: committeeId, per_page: "10", sort: "-total" });
        for (const e of byEmp?.results ?? []) {
          const amt = num(e.total);
          rows.push({
            source: "fec", record_type: "campaign_contribution",
            source_url: fecCommitteeUrl(committeeId), provider_record_id: `${committeeId}:emp:${e.employer ?? "unknown"}`,
            dedupe_key: `fec:emp:${committeeId}:${String(e.employer ?? "unknown").toLowerCase()}:${e.cycle ?? ""}`,
            person_id: personId, subject_name: off.name, counterparty_name: e.employer ?? "Unknown employer",
            city: null, state: null, employer: e.employer ?? null, occupation: null,
            amount: amt, amount_label: moneyLabel(amt), cycle_or_year: e.cycle ? String(e.cycle) : null,
            issue_or_industry: null, attribution: "Source: FEC", parser_version: PARSER_VERSION,
          });
        }

        // 3. Donor totals BY STATE (geographic context, no addresses).
        const byState = await fecJson("/schedules/schedule_a/by_state/", { committee_id: committeeId, per_page: "10", sort: "-total" });
        for (const s of byState?.results ?? []) {
          const amt = num(s.total);
          rows.push({
            source: "fec", record_type: "campaign_contribution",
            source_url: fecCommitteeUrl(committeeId), provider_record_id: `${committeeId}:state:${s.state ?? "??"}`,
            dedupe_key: `fec:state:${committeeId}:${String(s.state ?? "??").toLowerCase()}:${s.cycle ?? ""}`,
            person_id: personId, subject_name: off.name, counterparty_name: `Donors in ${s.state ?? "?"}`,
            city: null, state: s.state ?? null, employer: null, occupation: null,
            amount: amt, amount_label: moneyLabel(amt), cycle_or_year: s.cycle ? String(s.cycle) : null,
            issue_or_industry: null, attribution: "Source: FEC", parser_version: PARSER_VERSION,
          });
        }
      } catch (e) {
        errors++;
      }
    }

    const unique = dedupe(rows);
    if (unique.length) await sb.from("power_influence_records").upsert(unique, { onConflict: "dedupe_key" });
    await sb.from("power_sources").upsert({ source: "fec", label: "FEC (OpenFEC) — Influence Context (not trades)", enabled: true, last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }, { onConflict: "source" });
    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, rows_normalized: unique.length, errors }).eq("id", runId);
    return { ingested, normalized: unique.length, errors };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fec sync failed";
    await sb.from("power_sources").upsert({ source: "fec", label: "FEC (OpenFEC) — Influence Context (not trades)", enabled: true, last_error: msg, updated_at: new Date().toISOString() }, { onConflict: "source" }).then(() => {}, () => {});
    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, errors: errors + 1, note: msg }).eq("id", runId);
    return { ingested, normalized: 0, errors: errors + 1, note: msg };
  }
}

// ── OpenSecrets ──────────────────────────────────────────────────────────────

// OpenSecrets discontinued its PUBLIC API on 2025-04-15 — there is no live
// endpoint to call. This is a permanent, honest no-op: it never fabricates data
// and never marks the source enabled. Reviving lobbying context would require a
// commercial data agreement (commercial@opensecrets.org), at which point a new
// adapter should be written against whatever that agreement provides.
export async function syncOpenSecrets(): Promise<SyncResult> {
  return { ingested: 0, normalized: 0, errors: 0, note: "OpenSecrets public API discontinued 2025-04-15 — no data source available" };
}

function dedupe(rows: InfluenceRow[]): InfluenceRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.dedupe_key) ? false : (seen.add(r.dedupe_key), true)));
}
