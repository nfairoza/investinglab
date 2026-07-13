// Regenerate lib/congress/legislators-fallback.json from the public-domain
// @unitedstates/congress-legislators dataset (committee assignments + party).
//
// Usage:  node scripts/refresh-legislators.mjs
//
// The runtime (lib/congress/committees.ts) fetches this data LIVE from jsDelivr
// (with a raw.githubusercontent fallback) and 24h-caches it. This script bakes a
// checked-in snapshot so committee flags still work if BOTH remotes are blocked
// (corporate networks, headless cron). Run per Congress/session.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import yaml from "js-yaml";

const CDN = "https://cdn.jsdelivr.net/gh/unitedstates/congress-legislators@main";
const RAW = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "congress", "legislators-fallback.json");

async function fetchText(path) {
  try { const r = await fetch(`${CDN}${path}`, { cache: "no-store" }); if (r.ok) return r.text(); } catch {}
  const r2 = await fetch(`${RAW}${path}`, { cache: "no-store" });
  if (!r2.ok) throw new Error(`fetch failed: ${path} (${r2.status})`);
  return r2.text();
}

async function main() {
  const [committeesRaw, membershipRaw, legislatorsRaw] = await Promise.all([
    fetchText("/committees-current.yaml"),
    fetchText("/committee-membership-current.yaml"),
    fetchText("/legislators-current.yaml"),
  ]);
  const committees = yaml.load(committeesRaw);
  const membership = yaml.load(membershipRaw);
  const legislators = yaml.load(legislatorsRaw);

  const meta = {};
  for (const c of committees) if (c.thomas_id) meta[c.thomas_id] = { name: c.name, type: c.type };

  const byBioguide = {};
  for (const [thomasId, members] of Object.entries(membership)) {
    const parent = thomasId.slice(0, 4);
    const m = meta[thomasId] ?? meta[parent];
    if (!m) continue;
    for (const mem of members) {
      if (!mem.bioguide) continue;
      const list = (byBioguide[mem.bioguide] ??= []);
      if (!list.some((x) => x.name === m.name)) list.push({ thomasId: parent, name: m.name, type: m.type, title: mem.title ?? null });
    }
  }

  const nameToBioguide = {};
  const partyByBioguide = {};
  for (const leg of legislators) {
    const bio = leg.id?.bioguide;
    if (!bio) continue;
    const full = leg.name?.official_full || [leg.name?.first, leg.name?.last].filter(Boolean).join(" ");
    if (full) nameToBioguide[full.toLowerCase()] = bio;
    if (leg.name?.first && leg.name?.last) nameToBioguide[`${leg.name.first} ${leg.name.last}`.toLowerCase()] = bio;
    const party = leg.terms?.[leg.terms.length - 1]?.party;
    if (party) partyByBioguide[bio] = party;
  }

  const out = { generatedAt: new Date().toISOString().slice(0, 10), byBioguide, nameToBioguide, partyByBioguide };
  await writeFile(OUT, JSON.stringify(out), "utf8");
  console.log(`Wrote ${OUT}: ${Object.keys(byBioguide).length} members with committees.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
