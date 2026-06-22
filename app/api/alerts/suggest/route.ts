import { NextResponse } from "next/server";
import { getDb, withDbWrite, now } from "@/lib/db";
import { routeText } from "@/lib/ai/router";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { parseLooseJson } from "@/lib/ai/json";

export const dynamic = "force-dynamic";

const CACHE_KEY = "alertSuggestions";
const TTL_MS = 6 * 60 * 60 * 1000;

const SYSTEM = `You are a vigilant portfolio risk monitor. Decide which ALERTS matter most for this investor right now.
Rules:
- Consider their holdings, watchlist, and the current market. SEARCH THE WEB for upcoming earnings, key levels, and catalysts.
- Propose the FEW highest-value alerts (max 8) — the ones a smart investor would actually want pinged on. Skip noise.
- Each suggestion must map to one of these alert types with concrete params:
  - "price": { direction: "above"|"below", price: number }   // a meaningful technical/valuation level
  - "dayMove": { movePct: number }                            // unusual daily move worth knowing
  - "earnings": { withinDays: number }                        // upcoming earnings to prepare for
  - "score": { scoreOp: "above"|"below", scoreValue: 0-100 }  // quality/score crossing
- Favor the user's own holdings/watchlist; you may add 1-2 market-wide ones for big opportunities or risks.
- Give a one-line reason for each (why it matters now).
Return ONLY valid JSON (no markdown) matching the schema.`;

function buildPrompt(holdings: string[], watchlist: string[]): string {
  return `Holdings: ${holdings.join(", ") || "none"}.
Watchlist: ${watchlist.join(", ") || "none"}.

Search the web for each name's next earnings date, notable price levels, and any catalysts, plus the broad market backdrop. Then propose the most useful alerts.

Return JSON:
{
  "suggestions": [
    {
      "symbol": string,
      "type": "price" | "dayMove" | "earnings" | "score",
      "direction": "above" | "below",   // price only
      "price": number,                  // price only
      "movePct": number,                // dayMove only
      "withinDays": number,             // earnings only
      "scoreOp": "above" | "below",     // score only
      "scoreValue": number,             // score only
      "reason": string                  // one line: why this matters now
    }
  ]
}
Only include the param fields relevant to each suggestion's type.`;
}

// GET — return cached suggestions if fresh.
export async function GET() {
  const db = getDb();
  const cached = db.data.aiCache?.[CACHE_KEY];
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS) {
    return NextResponse.json({ cached: true, ...(cached.data as object) });
  }
  return NextResponse.json({ cached: false, data: cached?.data ?? null });
}

// POST — generate fresh suggestions, cache, return.
export async function POST() {
  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "Add a Claude or Gemini API key in Connectors." }, { status: 400 });
  }
  const db = getDb();
  const holdings = (db.data.holdings ?? []).map((h) => h.symbol);
  const watchlist = (db.data.watchlist ?? []).map((w) => w.symbol);

  try {
    const { text, provider, model } = await routeText({
      task: "deep-analysis",
      system: SYSTEM,
      user: buildPrompt(holdings, watchlist),
      maxTokens: 3072,
      webSearch: true,
    });
    const parsed = parseLooseJson(text);
    const result = { suggestions: parsed.suggestions ?? [], aiName: provider === "claude" ? "Claude" : "Gemini", model, generatedAt: now() };
    await withDbWrite((db) => {
      if (!db.data.aiCache) db.data.aiCache = {};
      db.data.aiCache[CACHE_KEY] = { generatedAt: result.generatedAt, data: result };
    });
    return NextResponse.json({ cached: false, ...result });
  } catch (e) {
    return NextResponse.json({ error: "generation_failed", message: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
