import { NextRequest, NextResponse } from "next/server";
import { congressData, marketData } from "@/lib/providers";
import { getTradesByMembers } from "@/lib/providers/congress-api";
import type { CongressTrade } from "@/lib/providers/types";
import { committeesForName, partyFor, ensureRoster } from "@/lib/congress/committees";
import { bucketSector, findOverlap, type SectorBucket } from "@/lib/congress/sectors";
import { computeClusters, scoreTrade, bracketLow, type ScoredTrade, type OptionsValidation } from "@/lib/congress/score";
import { routeText } from "@/lib/ai/router";

export const dynamic = "force-dynamic";

// Congress alpha is shared market data (not per-user) and expensive to compute
// (AI thesis + options read on every call). Cache the full payload in-memory for
// 12h, keyed by the window/limit. ?refresh=1 forces a rebuild. Cache resets on
// deploy, which is fine for a 12h-fresh signal.
const ALPHA_TTL_MS = 12 * 60 * 60 * 1000;
const alphaCache = new Map<string, { at: number; payload: any }>();

// The most-watched congressional traders (high volume / size / committee power).
// We always pull their recent trades and merge them into the feed so they surface
// even when they're outside the latest global disclosure pages.
const NOTABLE_MEMBERS = [
  "Pelosi", "Khanna", "McCaul", "Gottheimer", "Mark Green", "Boozman", "Crenshaw", "Garbarino", "Bresnahan",
];

// FMP's Senate feed exposes the bioguide id as `senateID`; the raw trade type
// doesn't carry it, so we stash it on the trade via a side map keyed by id.
// (congress-api maps senateID into nothing today; we re-derive committees by
//  name as the universal path, using bioguide only when present in the future.)

interface AlphaRow extends ScoredTrade {}

// Ask the AI for (a) a 2-sentence thesis and (b) an ESTIMATED options read for
// the top trades, in ONE call. Returns a map keyed by trade id.
async function aiEnrich(
  rows: ScoredTrade[],
): Promise<{ map: Record<string, { thesis: string; options: OptionsValidation }>; ai: "claude" | "gemini" | "none"; model: string | null }> {
  if (!rows.length) return { map: {}, ai: "none", model: null };
  const system = `You are an alternative-data analyst for a financial terminal. For each congressional trade given, write a precise 2-sentence thesis on its structural conviction (committee edge, capital scale, clustering) and ESTIMATE the likely options-market sentiment (BULLISH/BEARISH/NEUTRAL) for the ticker using your knowledge and any web context. Be clear this options read is an ESTIMATE, not live institutional flow. Return ONLY a JSON array, no markdown.`;
  const items = rows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    company: r.companyName,
    member: r.representative,
    chamber: r.chamber,
    action: r.action,
    size: r.sizeTranche,
    committee: r.committeeTag,
    sector: r.sector,
    clusterCount: r.clusterCount,
  }));
  const user = `Trades:\n${JSON.stringify(items, null, 2)}\n\nReturn JSON array of: {"id":string,"thesis":string,"options":"BULLISH"|"BEARISH"|"NEUTRAL"}. One object per trade id above.`;

  try {
    // Smart router: thesis + estimated options read is deep analysis -> Opus
    // leads, Gemini fallback, with web search.
    const { text, provider, model } = await routeText({ task: "deep-analysis", system, user, maxTokens: 3000, webSearch: true });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    const arr = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned) as any[];
    const map: Record<string, { thesis: string; options: OptionsValidation }> = {};
    for (const o of arr) {
      if (!o?.id) continue;
      const opt = String(o.options ?? "NEUTRAL").toUpperCase();
      map[o.id] = {
        thesis: String(o.thesis ?? ""),
        options: opt === "BULLISH" || opt === "BEARISH" ? (opt as OptionsValidation) : "NEUTRAL",
      };
    }
    return { map, ai: provider as "claude" | "gemini", model };
  } catch {
    return { map: {}, ai: "none", model: null };
  }
}

export async function GET(req: NextRequest) {
  const limit = Math.min(400, Math.max(50, Number(req.nextUrl.searchParams.get("limit")) || 250));
  // How far back to consider (days). Default 90; the UI exposes a window slider.
  const windowDays = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 90));
  const force = req.nextUrl.searchParams.get("refresh") === "1";

  // Serve from the 12h cache unless a refresh was requested.
  const cacheKey = `${windowDays}:${limit}`;
  const hit = alphaCache.get(cacheKey);
  if (!force && hit && Date.now() - hit.at < ALPHA_TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true, generatedAt: new Date(hit.at).toISOString() });
  }

  // Recent global stream + notable members' trades, merged & de-duped.
  const [recent, notable] = await Promise.all([
    congressData.getRecent(limit),
    getTradesByMembers(NOTABLE_MEMBERS).catch(() => []),
  ]);
  if ((!recent.data || recent.data.length === 0) && notable.length === 0) {
    return NextResponse.json({
      rows: [], macro: null, source: recent.source, asOf: recent.asOf,
      note: recent.note ?? "No congressional trades available.",
      rosterOk: false, optionsEstimated: true,
    });
  }

  const roster = await ensureRoster();
  // Merge + de-dupe by id, then keep only trades within the time window.
  const seen = new Set<string>();
  const cutoff = Date.now() - windowDays * 86_400_000;
  const all = [...(recent.data ?? []), ...notable]
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      const d = new Date(t.txDate || t.disclosureDate).getTime();
      return Number.isNaN(d) || d >= cutoff;
    });
  const trades = recent; // keep source/asOf reference below

  // Party lookup per trade (used for clustering + display).
  const partyCache = new Map<string, string>();
  async function partyOfTrade(t: CongressTrade): Promise<string> {
    if (partyCache.has(t.member)) return partyCache.get(t.member)!;
    const p = roster.ok ? await partyFor(null, t.member) : (t.party ?? "");
    partyCache.set(t.member, p);
    return p;
  }
  // Pre-resolve parties (parallel, deduped by member).
  await Promise.all(Array.from(new Set(all.map((t) => t.member))).map(async (m) => {
    const t = all.find((x) => x.member === m)!;
    await partyOfTrade(t);
  }));
  const partyOf = (t: CongressTrade) => partyCache.get(t.member) ?? t.party ?? "";

  // Clusters (ticker + direction within 14 days).
  const clusters = computeClusters(all, partyOf, 14);

  // Unique tickers → sector (FMP company profile, cached in the provider layer).
  const tickers = Array.from(new Set(all.map((t) => t.symbol).filter(Boolean))) as string[];
  const sectorMap = new Map<string, { sector: SectorBucket; name: string }>();
  await Promise.all(
    tickers.map(async (sym) => {
      try {
        const p = await marketData.getCompanyProfile(sym);
        sectorMap.set(sym, {
          sector: bucketSector(p.data?.sector, p.data?.industry),
          name: p.data?.name ?? sym,
        });
      } catch {
        sectorMap.set(sym, { sector: "Other", name: sym });
      }
    }),
  );

  // Committees per member (deduped).
  const committeeCache = new Map<string, { name: string }[]>();
  await Promise.all(
    Array.from(new Set(all.map((t) => t.member))).map(async (member) => {
      const c = roster.ok ? await committeesForName(member) : [];
      committeeCache.set(member, c);
    }),
  );

  // Score everything (deterministic, no AI yet).
  const scored: ScoredTrade[] = all
    .filter((t) => t.symbol) // need a ticker to score sector/options
    .map((t) => {
      const sm = sectorMap.get(t.symbol!) ?? { sector: "Other" as SectorBucket, name: t.symbol! };
      const committees = committeeCache.get(t.member) ?? [];
      const overlap = findOverlap(committees, sm.sector);
      const cl = clusters.get(t.id) ?? { count: 1, crossParty: false };
      return scoreTrade({
        trade: t,
        companyName: sm.name,
        sector: sm.sector,
        overlap,
        party: partyOf(t),
        clusterCount: cl.count,
        clusterCrossParty: cl.crossParty,
      });
    })
    .sort((a, b) => b.convictionScore - a.convictionScore || bracketLow(b.sizeTranche) - bracketLow(a.sizeTranche));

  // AI thesis + estimated options read for the top trades only (cost control).
  const top = scored.slice(0, 12);
  const { map: enrich, ai, model: aiModel } = await aiEnrich(top);
  for (const row of scored) {
    const e = enrich[row.id];
    if (e) {
      row.thesis = e.thesis;
      // Re-credit the options vector now that we have an estimated read.
      const aligned =
        (row.action === "BUY" && e.options === "BULLISH") ||
        (row.action === "SELL" && e.options === "BEARISH");
      row.optionsValidation = e.options;
      row.optionsEstimated = true;
      if (aligned && row.breakdown.options === 0) {
        row.breakdown.options = 10;
        row.convictionScore = Math.min(100, row.convictionScore + 10);
        row.tier = row.convictionScore >= 70 ? "HIGH" : row.convictionScore >= 40 ? "MEDIUM" : "LOW";
      }
    }
  }
  scored.sort((a, b) => b.convictionScore - a.convictionScore);

  // Macro module: rolling net buy/sell by sector + most-active members.
  const sectorNet = new Map<string, { buy: number; sell: number }>();
  const memberActivity = new Map<string, number>();
  for (const t of all) {
    memberActivity.set(t.member, (memberActivity.get(t.member) ?? 0) + 1);
    if (!t.symbol) continue;
    const sm = sectorMap.get(t.symbol);
    if (!sm) continue;
    const low = bracketLow(t.amountRange);
    const e = sectorNet.get(sm.sector) ?? { buy: 0, sell: 0 };
    if (t.type === "buy") e.buy += low; else if (t.type === "sell") e.sell += low;
    sectorNet.set(sm.sector, e);
  }
  const macro = {
    sectors: Array.from(sectorNet.entries())
      .map(([sector, v]) => ({ sector, net: v.buy - v.sell, buy: v.buy, sell: v.sell }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    topMembers: Array.from(memberActivity.entries())
      .map(([member, trades]) => ({ member, trades }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 5),
  };

  const generatedAt = new Date().toISOString();
  const payload = {
    rows: scored,
    macro,
    windowDays,
    tradeCount: all.length,
    source: trades.source,
    asOf: trades.asOf,
    rosterOk: roster.ok,
    rosterNote: roster.note,
    optionsEstimated: true,
    aiProvider: ai === "none" ? null : `${ai === "claude" ? "Claude" : "Gemini"}${aiModel ? ` (${aiModel})` : ""}`,
    generatedAt,
  };
  alphaCache.set(cacheKey, { at: Date.parse(generatedAt), payload });
  return NextResponse.json({ ...payload, cached: false });
}
