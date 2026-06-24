import type { SupabaseClient } from "@supabase/supabase-js";
import { powerServiceClient, isSourceActive } from "./config";
import { refreshPersonCounts } from "./sync";
import type { PowerTransactionType } from "./types";

// =============================================================================
// Power Trades — SEC Form 4 (corporate insiders) via EDGAR. FREE, no API key.
//
// HARD RULE (no hallucination): only documented EDGAR endpoints + the official
// Ownership XML schema (ownershipDocument) are used. Anything that cannot be
// fetched or parsed is recorded with parse_status='failed' — never fabricated.
//
// Endpoints (all data.sec.gov / www.sec.gov, no key, descriptive User-Agent
// required by SEC fair-access — set SEC_USER_AGENT):
//   - Latest Form 4 feed (all issuers):
//       https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom&count=N
//   - Filing folder index (per accession):
//       https://www.sec.gov/Archives/edgar/data/{cik}/{accessionNoDashes}/index.json
//   - Ownership XML doc: a *.xml item inside that folder containing <ownershipDocument>.
// SEC limits clients to ~10 req/s; we throttle and cap per run.
// =============================================================================

const SEC_BASE = "https://www.sec.gov";
const PARSER_VERSION = "pt-secform4-1";
const THROTTLE_MS = 160;          // stay well under SEC's 10 req/s
const MAX_FILINGS_PER_RUN = 60;   // bound requests + runtime per sync

function userAgent(): string {
  // SEC fair-access requires a descriptive UA with a contact. We refuse to make
  // requests without one rather than send a fake/default identity.
  return process.env.SEC_USER_AGENT || "";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function secFetch(url: string, accept = "application/json"): Promise<Response> {
  const ua = userAgent();
  if (!ua) throw new Error("SEC_USER_AGENT not configured (SEC fair-access requires a descriptive User-Agent with contact)");
  return fetch(url, {
    headers: { "User-Agent": ua, Accept: accept, "Accept-Encoding": "gzip, deflate" },
    cache: "no-store",
  });
}

// ---- tiny, dependency-free XML helpers (tolerant) ---------------------------

// First inner text of <tag>...</tag> (namespace-agnostic-ish for this schema).
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}
// Form 4 wraps many leaf values in a <value> child, e.g.
// <transactionShares><value>100</value></transactionShares>.
function tagValue(xml: string, name: string): string | null {
  const block = tag(xml, name);
  if (block == null) return null;
  const v = tag(block, "value");
  return (v ?? block).trim();
}
function allBlocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}
function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(String(s).replace(/[, $]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function isoDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Map Form 4 transaction codes (transactionCoding/transactionCode) to our enum.
// Codes per the SEC Section 16 instructions; A/D = acquired/disposed fallback.
function mapTxType(code: string | null, acqDisp: string | null): PowerTransactionType {
  const c = (code || "").toUpperCase();
  if (c === "P") return "buy";
  if (c === "S" || c === "F") return "sell";
  if (c === "A") return "income";      // grant/award (acquisition, not open-market)
  if (c === "M" || c === "X") return "option";
  if (c === "C") return "exchange";    // conversion
  if (c === "G") return "gift";
  const ad = (acqDisp || "").toUpperCase();
  if (ad === "A") return "buy";
  if (ad === "D") return "sell";
  return "unknown";
}

interface Form4Row {
  source: "sec_form_4";
  source_url: string | null;
  provider_record_id: string | null;
  dedupe_key: string;
  person_name: string;
  person_role: string | null;
  relationship: string;
  entity_name: string | null;       // issuer name
  ticker: string | null;            // issuer trading symbol
  asset_name: string | null;        // security title
  transaction_type: PowerTransactionType;
  transaction_date: string | null;
  disclosure_date: string | null;
  amount_min: number | null;
  amount_max: number | null;
  amount_label: string | null;
  filing_type: string;
  chamber_or_branch: "corporate";
  parser_version: string;
  _ownerCik: string | null;         // not a column; used for people identifiers
}

interface FeedItem { cik: string; accession: string; title: string }

// Parse the getcurrent atom feed into {cik, accession, title}. EDGAR feed shapes
// vary, so we extract from several patterns and de-dupe by accession.
function parseFeed(atom: string): FeedItem[] {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (const entry of allBlocks(atom, "entry")) {
    // accession number: "0001234567-25-000123" (in href, id, or a tag)
    const accM =
      entry.match(/accession[-_ ]?n(?:o|umber)?[=:>\s"]*([0-9]{10}-[0-9]{2}-[0-9]{6})/i) ||
      entry.match(/([0-9]{10}-[0-9]{2}-[0-9]{6})/);
    if (!accM) continue;
    const accession = accM[1];
    // CIK: from an Archives href if present, else a <cik> tag.
    const cikM =
      entry.match(/Archives\/edgar\/data\/(\d+)\//i) ||
      entry.match(/CIK[=>\s"]*0*(\d+)/i) ||
      entry.match(/<cik>\s*0*(\d+)\s*<\/cik>/i);
    const cik = cikM ? cikM[1] : "";
    const title = (tag(entry, "title") || "").replace(/\s+/g, " ").trim();
    if (seen.has(accession)) continue;
    seen.add(accession);
    items.push({ cik, accession, title });
  }
  return items;
}

// Find the ownership XML document URL within a filing folder via index.json.
async function findOwnershipXmlUrl(cik: string, accession: string): Promise<string | null> {
  const accNoDashes = accession.replace(/-/g, "");
  const cikClean = String(Number(cik)); // drop leading zeros for the data path
  const folder = `${SEC_BASE}/Archives/edgar/data/${cikClean}/${accNoDashes}`;
  const r = await secFetch(`${folder}/index.json`);
  if (!r.ok) throw new Error(`index.json HTTP ${r.status}`);
  const j = await r.json();
  const items: { name: string; type?: string }[] = j?.directory?.item ?? [];
  // Candidate XML docs: end in .xml, not the R-rendered XBRL (R1.xml…),
  // not the *-index, not the xsl-rendered copies.
  const candidates = items
    .map((it) => it.name)
    .filter((n) => /\.xml$/i.test(n) && !/^R\d+\.xml$/i.test(n) && !/-index/i.test(n) && !/^xsl/i.test(n));
  // Prefer names that look like an ownership doc.
  candidates.sort((a, b) => score(b) - score(a));
  return candidates.length ? `${folder}/${candidates[0]}` : null;
}
function score(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("form4") || n.includes("ownership")) return 3;
  if (n.includes("form")) return 2;
  return 1;
}

// Parse one ownership XML into 0+ normalized rows (non-derivative + derivative
// transactions). Returns rows + a flag whether the doc was a valid Form 4.
function parseOwnershipXml(xml: string, sourceUrl: string, accession: string): { rows: Form4Row[]; valid: boolean } {
  if (!/<ownershipDocument\b/i.test(xml)) return { rows: [], valid: false };

  const issuerBlock = tag(xml, "issuer") || "";
  const issuerName = tag(issuerBlock, "issuerName");
  let ticker = tagValue(issuerBlock, "issuerTradingSymbol") || tag(issuerBlock, "issuerTradingSymbol");
  if (ticker) {
    ticker = ticker.toUpperCase().trim();
    if (!ticker || ["NONE", "N/A", "NA"].includes(ticker)) ticker = null;
  }

  const ownerBlock = tag(xml, "reportingOwner") || "";
  const ownerName = tag(ownerBlock, "rptOwnerName") || "Unknown insider";
  const ownerCik = tag(ownerBlock, "rptOwnerCik");
  const relBlock = tag(ownerBlock, "reportingOwnerRelationship") || ownerBlock;
  const isDir = /<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(relBlock);
  const isOff = /<isOfficer>\s*(1|true)\s*<\/isOfficer>/i.test(relBlock);
  const isTen = /<isTenPercentOwner>\s*(1|true)\s*<\/isTenPercentOwner>/i.test(relBlock);
  const isOther = /<isOther>\s*(1|true)\s*<\/isOther>/i.test(relBlock);
  const officerTitle = tag(relBlock, "officerTitle");
  const roleParts = [
    isDir ? "Director" : null,
    isOff ? (officerTitle || "Officer") : null,
    isTen ? "10% owner" : null,
    isOther ? "Other" : null,
  ].filter(Boolean);
  const personRole = roleParts.join(", ") || "Insider";

  const periodOfReport = isoDate(tagValue(xml, "periodOfReport") || tag(xml, "periodOfReport"));

  const txBlocks = [
    ...allBlocks(xml, "nonDerivativeTransaction"),
    ...allBlocks(xml, "derivativeTransaction"),
  ];

  const rows: Form4Row[] = [];
  txBlocks.forEach((b, i) => {
    const code = tagValue(b, "transactionCode") || tag(b, "transactionCode");
    const acqDisp = tagValue(b, "transactionAcquiredDisposedCode");
    const shares = num(tagValue(b, "transactionShares"));
    const price = num(tagValue(b, "transactionPricePerShare"));
    const txDate = isoDate(tagValue(b, "transactionDate"));
    const security = tagValue(b, "securityTitle") || tag(tag(b, "securityTitle") || "", "value");
    const value = shares != null && price != null ? shares * price : null;
    const amountLabel =
      shares != null
        ? `${shares.toLocaleString()} sh${price != null ? ` @ $${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}${value != null ? ` (~$${Math.round(value).toLocaleString()})` : ""}`
        : null;
    rows.push({
      source: "sec_form_4",
      source_url: sourceUrl,
      provider_record_id: accession,
      dedupe_key: `sec_form_4:${accession}:${i}`,
      person_name: ownerName,
      person_role: personRole,
      relationship: "self",
      entity_name: issuerName || null,
      ticker,
      asset_name: security || issuerName || "Reported security",
      transaction_type: mapTxType(code, acqDisp),
      transaction_date: txDate,
      disclosure_date: periodOfReport, // filing/period date; feed acceptance date is later
      amount_min: value,
      amount_max: value,
      amount_label: amountLabel,
      filing_type: "4",
      chamber_or_branch: "corporate",
      parser_version: PARSER_VERSION,
      _ownerCik: ownerCik,
    });
  });

  return { rows, valid: true };
}

// Upsert corporate-insider people (category corporate_insider, secCik identifier).
async function upsertInsiders(sb: SupabaseClient, rows: Form4Row[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const byName = new Map<string, Form4Row>();
  for (const r of rows) {
    const k = r.person_name.toLowerCase();
    if (!byName.has(k)) byName.set(k, r);
  }
  for (const [lower, r] of byName) {
    const { data: existing } = await sb.from("power_people").select("id").ilike("canonical_name", r.person_name).maybeSingle();
    let personId = existing?.id as string | undefined;
    if (!personId) {
      const { data: ins } = await sb.from("power_people").insert({
        canonical_name: r.person_name,
        category: "corporate_insider",
        office: r.person_role,
        roles: r.person_role ? [r.person_role] : [],
        identifiers: r._ownerCik ? { secCik: r._ownerCik } : {},
        source_coverage: ["sec_form_4"],
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

// Sync recent Form 4 filings into Supabase. Admin-triggered / scheduled only.
export async function syncSecForm4(limit = MAX_FILINGS_PER_RUN): Promise<{ ingested: number; normalized: number; errors: number; note?: string }> {
  const sb = powerServiceClient();
  if (!sb) return { ingested: 0, normalized: 0, errors: 1, note: "Supabase service client not configured" };
  if (!isSourceActive("sec_form_4")) return { ingested: 0, normalized: 0, errors: 0, note: "sec_form_4 disabled" };
  if (!userAgent()) return { ingested: 0, normalized: 0, errors: 1, note: "SEC_USER_AGENT not configured" };

  const { data: run } = await sb.from("power_source_sync_runs").insert({ source: "sec_form_4" }).select("id").maybeSingle();
  const runId = run?.id as string | undefined;

  let ingested = 0, errors = 0;
  const normalized: Form4Row[] = [];
  const rawRows: any[] = [];

  try {
    const feedUrl = `${SEC_BASE}/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&output=atom&start=0&count=${Math.min(limit * 2, 200)}`;
    const fr = await secFetch(feedUrl, "application/atom+xml");
    if (!fr.ok) throw new Error(`getcurrent HTTP ${fr.status}`);
    const atom = await fr.text();
    const feed = parseFeed(atom).filter((f) => f.cik && f.accession).slice(0, limit);
    if (feed.length === 0) throw new Error("feed returned no parseable Form 4 entries");

    for (const item of feed) {
      ingested++;
      await sleep(THROTTLE_MS);
      try {
        const xmlUrl = await findOwnershipXmlUrl(item.cik, item.accession);
        if (!xmlUrl) {
          rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: item.title, payload: { item }, parse_status: "failed", parse_note: "no ownership .xml found in filing folder" });
          continue;
        }
        await sleep(THROTTLE_MS);
        const xr = await secFetch(xmlUrl, "application/xml");
        if (!xr.ok) {
          rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: item.title, payload: { xmlUrl }, parse_status: "failed", parse_note: `xml HTTP ${xr.status}` });
          continue;
        }
        const xml = await xr.text();
        const indexUrl = `${SEC_BASE}/Archives/edgar/data/${Number(item.cik)}/${item.accession.replace(/-/g, "")}/${item.accession}-index.htm`;
        const { rows, valid } = parseOwnershipXml(xml, indexUrl, item.accession);
        if (!valid) {
          rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: item.title, payload: { xmlUrl }, parse_status: "failed", parse_note: "not an ownershipDocument" });
          continue;
        }
        if (rows.length === 0) {
          rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: rows[0]?.person_name ?? item.title, payload: { xmlUrl }, parse_status: "no_trade_rows", parse_note: "no non-derivative/derivative transactions" });
          continue;
        }
        normalized.push(...rows);
        rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: rows[0].person_name, payload: { xmlUrl, issuer: rows[0].entity_name, ticker: rows[0].ticker, count: rows.length }, parse_status: rows[0].ticker ? "parsed" : "partial", parse_note: rows[0].ticker ? null : "issuer has no trading symbol" });
      } catch (e) {
        errors++;
        rawRows.push({ source: "sec_form_4", provider_record_id: item.accession, person_name: item.title, payload: { item }, parse_status: "failed", parse_note: e instanceof Error ? e.message : "fetch/parse failed" });
      }
    }

    if (rawRows.length) await sb.from("power_disclosures_raw").insert(rawRows.slice(0, 800)).then(() => {}, () => {});

    const peopleMap = await upsertInsiders(sb, normalized);
    // Strip the helper-only _ownerCik field before writing trade rows.
    const withPerson = normalized.map(({ _ownerCik, ...n }) => ({ ...n, person_id: peopleMap.get(n.person_name.toLowerCase()) ?? null }));
    const seen = new Set<string>();
    const unique = withPerson.filter((n) => (seen.has(n.dedupe_key) ? false : (seen.add(n.dedupe_key), true)));
    if (unique.length) await sb.from("power_trade_records").upsert(unique, { onConflict: "dedupe_key" });

    await refreshPersonCounts(sb);

    await sb.from("power_sources").upsert({
      source: "sec_form_4", label: "SEC Form 4 (EDGAR) — corporate insiders",
      enabled: true, last_sync_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "source" });

    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, rows_normalized: unique.length, errors }).eq("id", runId);
    return { ingested, normalized: unique.length, errors, note: `${feed.length} filings scanned` };
  } catch (e) {
    errors++;
    const msg = e instanceof Error ? e.message : "sync failed";
    await sb.from("power_sources").upsert({ source: "sec_form_4", label: "SEC Form 4 (EDGAR) — corporate insiders", enabled: true, last_error: msg, updated_at: new Date().toISOString() }, { onConflict: "source" }).then(() => {}, () => {});
    if (runId) await sb.from("power_source_sync_runs").update({ finished_at: new Date().toISOString(), rows_ingested: ingested, errors, note: msg }).eq("id", runId);
    return { ingested, normalized: 0, errors, note: msg };
  }
}
