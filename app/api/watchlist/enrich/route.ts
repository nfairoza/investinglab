import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { parseLooseJson } from "@/lib/ai/json";
import { getUserClient } from "@/lib/supabase-data";
import { parseBody } from "@/lib/validate";
import { readServerCache, writeServerCache } from "@/lib/server-cache";
import { isDailyStale } from "@/lib/daily-cache";
import { guardAiRate } from "@/lib/rate-limit";
import { deriveVerdict, type EnrichAnalysis } from "@/lib/watchlist/verdict";
import { decideEnrich } from "@/lib/watchlist/enrich-policy";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a skeptical equity analyst writing for a non-expert.
Given live data for a watchlist stock, return a concise JSON analysis with an ideal
buy price, fair value range, bull case, bear case, next catalyst, and an action.
Be realistic — separate "good company" from "good price today". Use ranges, not
false precision. Return ONLY valid JSON (no markdown).`;

// Global (not per-user) cache key for a symbol's enrichment analysis. The AI
// analysis of a stock isn't personal, so user B reuses user A's for the day.
const enrichKey = (symbol: string) => `shared:enrich:${symbol.toUpperCase()}`;

// Generate the AI analysis for a symbol from live data. Returns the parsed analysis
// object (the price-INSENSITIVE "thinking" we cache), or throws.
async function generateAnalysis(symbol: string, quoteData: unknown): Promise<EnrichAnalysis> {
  const [fin, analyst, dcf] = await Promise.all([
    marketData.getFinancials(symbol),
    marketData.getAnalystData(symbol),
    marketData.getDcf(symbol),
  ]);

  const dataBlock = quoteData
    ? `QUOTE: ${JSON.stringify(quoteData)}
FINANCIALS(recent): ${JSON.stringify(fin.data?.quarters?.slice(-4) ?? "n/a")}
ANALYST: ${JSON.stringify(analyst.data ?? "n/a")}
DCF: ${JSON.stringify(dcf.data ?? "n/a")}`
    : `Live feed unavailable — search the web for ${symbol}'s current price, valuation, and news.`;

  const user = `Analyze ${symbol} as a potential buy.

DATA:
${dataBlock}

Return JSON exactly:
{
  "idealBuy": number,            // a sensible entry price (number only)
  "fairValue": "string range",   // e.g. "$180–$210"
  "bullCase": "one sentence",
  "bearCase": "one sentence",
  "catalyst": "next catalyst / why now, one sentence",
  "aiAction": "Buy now" | "Start small" | "Wait" | "Avoid",
  "note": "one-line summary"
}`;

  // routeText gives Claude→Gemini fallback so a missing Claude key doesn't make
  // Analyze silently do nothing. Labeled "enrich" for per-feature cost tracking.
  const { text } = await routeText({ task: "light", feature: "enrich", system: SYSTEM, user, maxTokens: 800, webSearch: !quoteData });
  const parsed = parseLooseJson(text) as any;
  if (!parsed || typeof parsed !== "object") throw new Error("Could not parse the analysis.");
  const out: EnrichAnalysis = {};
  if (typeof parsed.idealBuy === "number" && parsed.idealBuy > 0) out.idealBuy = parsed.idealBuy;
  if (parsed.fairValue) out.fairValue = String(parsed.fairValue);
  if (parsed.bullCase) out.bullCase = String(parsed.bullCase);
  if (parsed.bearCase) out.bearCase = String(parsed.bearCase);
  if (parsed.catalyst) out.catalyst = String(parsed.catalyst);
  if (parsed.aiAction) out.aiAction = String(parsed.aiAction);
  if (parsed.note) out.note = String(parsed.note);
  return out;
}

// POST /api/watchlist/enrich { id, refresh? }
//
// Two callers (components/watchlist-manager.tsx):
//   - Automatic stale-while-revalidate: a row scrolled into view whose analysis is
//     daily-stale fires this with refresh:false — the server regenerates ONLY if
//     the shared cache is missing/stale (first-viewer-pays), so everyone else that
//     day reuses it. This is how regular users get fresh analysis: on a schedule /
//     by staleness, never by an on-demand "make AI run now" button.
//   - Manual force Re-analyze: refresh:true. This is ADMIN-ONLY — it bypasses the
//     daily-stale gate and regenerates unconditionally, for debugging/QA. A
//     non-admin who sends refresh:true is rejected 403 (enforced here, not just
//     hidden in the UI), so the force path can't be reached by crafting a request.
//
// Caching strategy (AIEFF1): the AI ANALYSIS (fair value, ideal buy, cases,
// catalyst) is cached GLOBALLY per symbol for the day — it isn't personal and is
// the expensive part. The price-sensitive VERDICT (action / "below your ideal
// entry") is re-derived against the LIVE quote on every read.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await parseBody(req, z.object({ id: z.string().min(1), refresh: z.boolean().optional() }));
  if (!parsed.ok) return parsed.response;
  const { id } = parsed.data;

  // Force regeneration is admin-only (decideEnrich, pure + tested). A non-admin
  // force is rejected outright with 403 rather than silently downgraded — the
  // client must not believe it forced a refresh when it didn't.
  const decision = decideEnrich(parsed.data.refresh === true, ctx.isAdmin);
  if (decision.kind === "forbidden") {
    return NextResponse.json({ error: "forbidden", message: "Manual re-analyze is admin-only. Your analysis refreshes automatically each day." }, { status: 403 });
  }
  const force = decision.kind === "force";

  const { data: item } = await ctx.supabase.from("watch_list_items").select("*").eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "watch item not found" }, { status: 404 });

  const symbol = String(item.symbol).toUpperCase();

  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "No AI key configured — add a Claude or Gemini key in Connectors." }, { status: 400 });
  }

  // Live quote is always fetched (60s-cached, cheap) — it's what the verdict is
  // re-derived against.
  const quote = await marketData.getQuote(symbol);
  const livePrice = quote.data?.price ?? null;

  // Resolve the cached analysis. Admin force always regenerates; otherwise
  // first-requester-generates on a miss/daily-stale, and everyone else reuses
  // today's global analysis.
  const cacheKey = enrichKey(symbol);
  let analysis: EnrichAnalysis;
  let generatedAt: string;

  const cached = await readServerCache<EnrichAnalysis>(cacheKey);
  const needsGen = force || !cached.value || isDailyStale(cached.generatedAt);

  if (needsGen) {
    // Only the (re)generation path spends tokens, so only it is rate-limited.
    // Two caps: the standard burst guard, plus a per-user/day ceiling on
    // background enrichment so the automatic refresh can't run away (viewport
    // storms, many stale rows). Admins bypass both (force path, for QA).
    const burst = await guardAiRate(ctx, "enrich");
    if (burst) return burst;
    const daily = await guardAiRate(ctx, "enrich-daily", 20, 24 * 60 * 60 * 1000);
    if (daily) return daily;
    try {
      analysis = await generateAnalysis(symbol, quote.data);
      generatedAt = await writeServerCache(cacheKey, analysis);
    } catch (e) {
      // On a fresh generation failure, fall back to any stale cache we have rather
      // than failing the click outright.
      if (cached.value) { analysis = cached.value; generatedAt = cached.generatedAt ?? new Date().toISOString(); }
      else return NextResponse.json({ error: "analysis_failed", message: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
    }
  } else {
    analysis = cached.value!;
    generatedAt = cached.generatedAt ?? new Date().toISOString();
  }

  // Re-derive the price-sensitive verdict against the LIVE price — never served
  // from the cached analysis verbatim.
  const verdict = deriveVerdict(analysis, livePrice);

  // Persist the analysis + live verdict onto the user's row so the existing table
  // renders it. `analyzed_at` is the ANALYSIS generation time (what "Analysis from
  // {time}" shows); the action is the live-derived verdict.
  const patch: Record<string, unknown> = {
    analyzed_at: generatedAt,
    updated_at: new Date().toISOString(),
    ai_action: verdict.action,
  };
  if (analysis.idealBuy != null) patch.ideal_buy = analysis.idealBuy;
  if (analysis.fairValue) patch.fair_value = analysis.fairValue;
  if (analysis.bullCase) patch.bull_case = analysis.bullCase;
  if (analysis.bearCase) patch.bear_case = analysis.bearCase;
  if (analysis.catalyst) patch.catalyst = analysis.catalyst;
  if (analysis.note) patch.note = analysis.note;
  const { data: updated } = await ctx.supabase.from("watch_list_items").update(patch).eq("id", id).select("*").maybeSingle();

  return NextResponse.json({
    item: updated,
    source: quote.source,
    generatedAt,
    livePrice,
    verdict,
    cached: !needsGen,
  });
}
