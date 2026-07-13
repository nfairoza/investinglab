import { serviceClient } from "@/lib/service-client";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { marketData } from "@/lib/providers";
import { withFmpFeature } from "@/lib/providers/fmp";
import { committeesForBioguide, committeesForName } from "@/lib/congress/committees";
import { computeCommitteeOverlap } from "./committee-jurisdictions";

// PT4 — nightly `pt-committee-flags` job. For each congressional trade, resolve
// the member's committees (bioguide id if we have it, else by name) and the
// traded ticker's sector, and store whether the trade falls in the member's
// committee jurisdiction. Chunked by trade cursor for the Hobby 10s cap.
//
// Sector lookups are cached per ticker for a day (etf:const-style) so a heavily-
// traded name is fetched once. Committee rosters are 24h-cached inside
// lib/congress/committees. Rows render from power_trade_flags; nothing computes
// on request.

const CURSOR_KEY = "pt-flags:cursor";
const SECTOR_TTL_MS = 24 * 60 * 60 * 1000;

interface TradeRow {
  id: string; ticker: string | null; person_name: string; person_id: string | null; chamber_or_branch: string | null;
}

async function getSector(ticker: string): Promise<{ sector: string | null; industry: string | null } | null> {
  const key = `pt:sector:${ticker.toUpperCase()}`;
  const cached = await readServerCache<{ sector: string | null; industry: string | null }>(key, SECTOR_TTL_MS);
  if (cached.value && !cached.stale) return cached.value;
  const res = await withFmpFeature("pt_flags", () => marketData.getCompanyProfile(ticker));
  if (!res.data) return cached.value ?? null;
  const value = { sector: res.data.sector ?? null, industry: (res.data as any).industry ?? null };
  await writeServerCache(key, value);
  return value;
}

// Person identifiers store the bioguide id for FMP-senate rows; fall back to name.
async function committeesFor(personId: string | null, personName: string, db: any): Promise<{ name: string }[]> {
  let bioguide: string | null = null;
  if (personId) {
    const { data } = await db.from("power_people").select("identifiers").eq("id", personId).maybeSingle();
    bioguide = (data as any)?.identifiers?.bioguideId ?? null;
  }
  const list = bioguide ? await committeesForBioguide(bioguide) : await committeesForName(personName);
  return list.map((c) => ({ name: c.name }));
}

export async function runPtCommitteeFlags(opts: { sliceSize?: number; nowMs?: number } = {}): Promise<{ trades: number; flagged: number; processed: number; wrapped: boolean }> {
  const db = serviceClient();
  if (!db) return { trades: 0, flagged: 0, processed: 0, wrapped: false };
  const sliceSize = opts.sliceSize ?? 60;
  const nowMs = opts.nowMs ?? Date.now();

  // Only congressional trades with a ticker (committee jurisdiction is a
  // congressional concept — insider/executive rows are out of scope here).
  const { data: idRows } = await db
    .from("power_trade_records")
    .select("id")
    .in("chamber_or_branch", ["house", "senate"])
    .not("ticker", "is", null)
    .order("id", { ascending: true })
    .limit(50_000);
  const ids = (idRows ?? []).map((r: any) => String(r.id));
  if (ids.length === 0) return { trades: 0, flagged: 0, processed: 0, wrapped: true };

  const cur = (await readServerCache<{ i: number }>(CURSOR_KEY, Number.MAX_SAFE_INTEGER)).value ?? { i: 0 };
  const start = cur.i % ids.length;
  const sliceIds = ids.slice(start, start + sliceSize);
  const wrapped = start + sliceSize >= ids.length;

  const { data: trades } = await db
    .from("power_trade_records")
    .select("id,ticker,person_name,person_id,chamber_or_branch")
    .in("id", sliceIds);

  // Cache committees per person within this run (many trades share a member).
  const committeeMemo = new Map<string, { name: string }[]>();
  let flagged = 0;
  let processed = 0;
  for (const t of (trades ?? []) as TradeRow[]) {
    if (!t.ticker) continue;
    const memoKey = t.person_id ?? `name:${t.person_name}`;
    let committees = committeeMemo.get(memoKey);
    if (!committees) { committees = await committeesFor(t.person_id, t.person_name, db); committeeMemo.set(memoKey, committees); }

    const sec = await getSector(t.ticker);
    const o = computeCommitteeOverlap(committees, sec?.sector, sec?.industry);
    await db.from("power_trade_flags").upsert({
      trade_id: t.id,
      committee_overlap: o.overlap,
      overlap_level: o.level,
      committee: o.committee,
      sector: o.sector,
      computed_at: new Date(nowMs).toISOString(),
    }, { onConflict: "trade_id" });
    processed++;
    if (o.overlap) flagged++;
  }

  await writeServerCache(CURSOR_KEY, { i: wrapped ? 0 : start + sliceSize });
  return { trades: ids.length, flagged, processed, wrapped };
}
