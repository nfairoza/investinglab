import yaml from "js-yaml";

// =============================================================================
// Live congressional committee rosters from the @unitedstates open-data project.
//
// The canonical host (theunitedstates.io) is blocked on some corporate networks,
// so we pull the SAME source files from the jsDelivr CDN mirror of the GitHub
// repo. Data is YAML; we parse + cache it for 24h (committee membership changes
// rarely). Everything is keyed by the bioguide id, which is also what FMP's
// Senate feed returns as `senateID`. House rows have no id, so we resolve them
// by name via the legislators roster.
// =============================================================================

const CDN = "https://cdn.jsdelivr.net/gh/unitedstates/congress-legislators@main";
const RAW = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main"; // fallback
const TTL_MS = 24 * 60 * 60 * 1000;

export interface CommitteeMembership {
  thomasId: string; // committee code, e.g. "SSAF"
  name: string; // "Senate Committee on Armed Services"
  type: "house" | "senate" | "joint";
  title?: string; // e.g. "Chairman"
}

interface RosterCache {
  at: number;
  byBioguide: Map<string, CommitteeMembership[]>;
  nameToBioguide: Map<string, string>; // normalized "first last" -> bioguide
  partyByBioguide: Map<string, string>; // "Democrat" | "Republican" | "Independent"
}

let cache: RosterCache | null = null;
let inflight: Promise<RosterCache> | null = null;

function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(rep|sen|representative|senator|mr|mrs|ms|dr|jr|sr|ii|iii|iv)\.?\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(path: string): Promise<string> {
  try {
    const r = await fetch(`${CDN}${path}`, { cache: "no-store" });
    if (r.ok) return r.text();
  } catch { /* try raw fallback */ }
  const r2 = await fetch(`${RAW}${path}`, { cache: "no-store" });
  if (!r2.ok) throw new Error(`roster fetch failed: ${path} (${r2.status})`);
  return r2.text();
}

async function build(): Promise<RosterCache> {
  const [committeesRaw, membershipRaw, legislatorsRaw] = await Promise.all([
    fetchText("/committees-current.yaml"),
    fetchText("/committee-membership-current.yaml"),
    fetchText("/legislators-current.yaml"),
  ]);

  const committees = yaml.load(committeesRaw) as any[];
  const membership = yaml.load(membershipRaw) as Record<string, any[]>;
  const legislators = yaml.load(legislatorsRaw) as any[];

  // thomas_id -> {name, type}
  const meta = new Map<string, { name: string; type: "house" | "senate" | "joint" }>();
  for (const c of committees) {
    if (c.thomas_id) meta.set(c.thomas_id, { name: c.name, type: c.type });
  }

  const byBioguide = new Map<string, CommitteeMembership[]>();
  for (const [thomasId, members] of Object.entries(membership)) {
    // Subcommittee codes look like "SSAF15"; the parent is the 4-char prefix.
    const parent = thomasId.slice(0, 4);
    const m = meta.get(thomasId) ?? meta.get(parent);
    if (!m) continue;
    for (const mem of members as any[]) {
      if (!mem.bioguide) continue;
      const list = byBioguide.get(mem.bioguide) ?? [];
      // Dedupe by committee name (member may sit on parent + subcommittees).
      if (!list.some((x) => x.name === m.name)) {
        list.push({ thomasId: parent, name: m.name, type: m.type, title: mem.title });
      }
      byBioguide.set(mem.bioguide, list);
    }
  }

  const nameToBioguide = new Map<string, string>();
  const partyByBioguide = new Map<string, string>();
  for (const leg of legislators) {
    const bio = leg.id?.bioguide;
    if (!bio) continue;
    const full = leg.name?.official_full || [leg.name?.first, leg.name?.last].filter(Boolean).join(" ");
    if (full) nameToBioguide.set(norm(full), bio);
    const last = leg.name?.last, first = leg.name?.first;
    if (first && last) nameToBioguide.set(norm(`${first} ${last}`), bio);
    const party = leg.terms?.[leg.terms.length - 1]?.party;
    if (party) partyByBioguide.set(bio, party);
  }

  return { at: Date.now(), byBioguide, nameToBioguide, partyByBioguide };
}

async function getRoster(): Promise<RosterCache> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = build()
    .then((c) => { cache = c; return c; })
    .finally(() => { inflight = null; });
  return inflight;
}

// Committees for a member identified by bioguide id (Senate feed gives this).
export async function committeesForBioguide(bioguide: string): Promise<CommitteeMembership[]> {
  if (!bioguide) return [];
  const r = await getRoster();
  return r.byBioguide.get(bioguide) ?? [];
}

// Committees for a member identified by display name (House feed has no id).
export async function committeesForName(name: string): Promise<CommitteeMembership[]> {
  if (!name) return [];
  const r = await getRoster();
  const bio = r.nameToBioguide.get(norm(name));
  return bio ? r.byBioguide.get(bio) ?? [] : [];
}

// Party letter (D/R/I) for a member, by bioguide or name. Falls back to "".
export async function partyFor(bioguide: string | null, name: string): Promise<string> {
  const r = await getRoster();
  const bio = bioguide || r.nameToBioguide.get(norm(name)) || "";
  const full = bio ? r.partyByBioguide.get(bio) : undefined;
  if (!full) return "";
  if (/democrat/i.test(full)) return "D";
  if (/republican/i.test(full)) return "R";
  return "I";
}

// Warm/refresh helper (also surfaces fetch errors to callers if needed).
export async function ensureRoster(): Promise<{ ok: boolean; note?: string }> {
  try {
    const r = await getRoster();
    return { ok: r.byBioguide.size > 0 };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "roster unavailable" };
  }
}
