import { NextResponse } from "next/server";
import { now } from "@/lib/db";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { routeText } from "@/lib/ai/router";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { parseLooseJson } from "@/lib/ai/json";

export const dynamic = "force-dynamic";

const CACHE_KEY = "watchlistRecs";
const TTL_MS = 24 * 60 * 60 * 1000; // once per day; no user refresh button

const SYSTEM = `You suggest a few stocks a specific investor might want to ADD to their watchlist.
Rules:
- Base picks on their current holdings, watch lists, and recently-viewed tickers — infer their
  interests (sectors, themes, risk). SEARCH THE WEB for what's relevant now.
- Suggest 3-6 tickers they do NOT already hold or watch. Real, currently-traded US tickers only.
- One short, specific reason each (why it fits THEM). Neutral, not hype. Not financial advice.
Return ONLY valid JSON (no markdown): { "recs": [ { "symbol": "AAPL", "name": "Apple", "reason": "..." } ] }`;

function buildPrompt(holdings: string[], watch: string[], recent: string[]): string {
  return `Holdings: ${holdings.join(", ") || "none"}.
Watch lists: ${watch.join(", ") || "none"}.
Recently viewed: ${recent.join(", ") || "none"}.
Suggest a few NEW tickers (not already in those lists) this person might like, each with a one-line reason. Return the JSON.`;
}

// GET only — serve cached recs; regenerate at most once / 24h (first load after
// expiry). No POST: users can't trigger fresh AI calls (token control).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ recs: [] });

  const cached = await readAiCache(ctx, CACHE_KEY);
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS) {
    return NextResponse.json(cached.data as object);
  }
  if (!resolveApiKey() && !geminiKey()) return NextResponse.json({ recs: [] });

  const [unified, { data: wl }, { data: rv }] = await Promise.all([
    getUnifiedHoldings(ctx.supabase, { realTickersOnly: true }),
    ctx.supabase.from("watch_list_items").select("symbol"),
    ctx.supabase.from("recently_viewed").select("symbol").order("viewed_at", { ascending: false }).limit(20),
  ]);
  const held = new Set<string>();
  const holdingSyms = Array.from(new Set(unified.map((h) => h.symbol)));
  const watchSyms = (wl ?? []).map((w: any) => String(w.symbol).toUpperCase());
  const recentSyms = (rv ?? []).map((r: any) => String(r.symbol).toUpperCase());
  [...holdingSyms, ...watchSyms].forEach((s) => held.add(s));

  try {
    const { text } = await routeText({
      task: "light", system: SYSTEM, // short "you might like" list — cheap/fast model is plenty
      user: buildPrompt(holdingSyms, watchSyms, recentSyms), maxTokens: 1500, webSearch: true,
    });
    const parsed = parseLooseJson(text) as { recs?: { symbol: string; name?: string; reason?: string }[] };
    // Drop anything they already hold/watch, dedupe, cap at 6.
    const seen = new Set<string>();
    const recs = (parsed.recs ?? [])
      .map((r) => ({ symbol: String(r.symbol ?? "").toUpperCase(), name: r.name ?? null, reason: r.reason ?? "" }))
      .filter((r) => r.symbol && !held.has(r.symbol) && !seen.has(r.symbol) && (seen.add(r.symbol), true))
      .slice(0, 6);
    const result = { recs, generatedAt: now() };
    await writeAiCache(ctx, CACHE_KEY, { generatedAt: result.generatedAt, data: result });
    return NextResponse.json(result);
  } catch {
    // Silent: a missing recs card is fine; never surface an AI error to the user.
    return NextResponse.json({ recs: [] });
  }
}
