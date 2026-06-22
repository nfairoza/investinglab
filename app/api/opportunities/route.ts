import { NextRequest, NextResponse } from "next/server";
import { now } from "@/lib/db";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { routeText } from "@/lib/ai/router";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { parseLooseJson } from "@/lib/ai/json";

export const dynamic = "force-dynamic";

const CACHE_KEY = "opportunities";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — auto-run-on-open reuses a recent scan

// A small curated large-cap universe to scan for NEW ideas (mirrors the Stock
// Map universe). The AI may also surface other tickers via web research.
const CURATED = [
  "AAPL","MSFT","NVDA","AVGO","AMD","GOOGL","META","AMZN","TSLA","NFLX",
  "LLY","UNH","JPM","V","MA","COST","WMT","XOM","CVX","CAT","GE","PLTR",
  "MU","NOW","CRM","ORCL","ISRG","BKNG","ANET","VRT",
];

const SYSTEM = `You are a sharp, skeptical portfolio strategist helping a retail investor deploy CASH.
Rules:
- Use the holdings, watchlist, and available cash provided. SEARCH THE WEB for current prices, recent news, earnings, and catalysts.
- Recommend concrete actions for THIS cash amount: BUY (new or add), TRIM, or SELL. Give a specific dollar amount per idea that fits the cash budget; buys must sum to <= available cash.
- Cover three lanes: (1) best uses among what they ALREADY hold/watch, (2) NEW opportunities from the broad market worth deploying cash into, (3) anything to TRIM/SELL to raise quality or cut risk.
- Each idea: ticker, action, dollarAmount, a one-line thesis, the key risk, a confidence 0-100, and a timeHorizon.
- Be honest about uncertainty. Separate "good company" from "good entry price today". No fake precision.
- This is educational analysis, NOT financial advice, and you must not place trades.
Return ONLY valid JSON (no markdown) matching the schema given.`;

function buildPrompt(cash: number, holdings: any[], watchlist: string[]): string {
  const hold = holdings.map((h) => `${h.symbol} (${h.shares} sh @ $${h.avgCost})`).join(", ") || "none";
  return `Available cash to deploy: $${cash.toLocaleString()}.

Current holdings: ${hold}.
Watchlist: ${watchlist.join(", ") || "none"}.
Curated large-cap universe to also consider for new ideas: ${CURATED.join(", ")}.

Search the web for the latest prices, news, earnings, and market backdrop, then produce a ranked plan.

Return JSON with this exact shape:
{
  "marketSummary": string,                 // 2-3 sentences on the current market backdrop / what's happening now
  "ideas": [
    {
      "ticker": string,
      "action": "Buy" | "Add" | "Trim" | "Sell",
      "dollarAmount": number,              // suggested $ to allocate (0 for sells where you'd exit fully — put proceeds idea in thesis)
      "lane": "owned" | "new" | "reduce",  // owned=already hold/watch, new=fresh idea, reduce=trim/sell
      "thesis": string,                    // one line why
      "risk": string,                      // the key risk
      "confidence": number,                // 0-100
      "timeHorizon": string                // e.g. "1-3 months", "6-12 months"
    }
  ],
  "notes": string                          // caveats, e.g. cash left undeployed and why
}
Provide 4-8 ideas total, spanning the three lanes. Keep total buy/add dollarAmount <= the available cash.`;
}

async function generate(cash: number, holdings: any[], watchlist: string[]) {
  const { text, provider, model } = await routeText({
    task: "deep-analysis",
    system: SYSTEM,
    user: buildPrompt(cash, holdings, watchlist),
    maxTokens: 4096,
    webSearch: true,
  });
  const parsed = parseLooseJson(text);
  return {
    ...parsed,
    cash,
    aiName: provider === "claude" ? "Claude" : "Gemini",
    model,
    generatedAt: now(),
  };
}

// GET — return cached scan if fresh (within TTL), else null + meta so the client
// can decide whether to trigger a fresh run. ?force=1 ignores the cache.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const cached = await readAiCache(ctx, CACHE_KEY);
  if (!force && cached && Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS) {
    return NextResponse.json({ cached: true, ...(cached.data as object) });
  }
  return NextResponse.json({ cached: false, stale: Boolean(cached), data: cached?.data ?? null });
}

// POST — run a fresh scan, cache it, return it.
export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "Add a Claude or Gemini API key in Connectors to use AI opportunities." }, { status: 400 });
  }
  const [{ data: cashRow }, { data: holdings }, { data: wl }] = await Promise.all([
    ctx.supabase.from("cash").select("amount").maybeSingle(),
    ctx.supabase.from("holdings").select("symbol,shares,avg_cost"),
    ctx.supabase.from("watchlist").select("symbol"),
  ]);
  const cash = Number(cashRow?.amount ?? 0);
  const holdingList = (holdings ?? []).map((h: any) => ({ symbol: h.symbol, shares: h.shares, avgCost: h.avg_cost }));
  const watchlist = (wl ?? []).map((w: any) => w.symbol);

  try {
    const result = await generate(cash, holdingList, watchlist);
    await writeAiCache(ctx, CACHE_KEY, { generatedAt: result.generatedAt, data: result });
    return NextResponse.json({ cached: false, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", message: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 },
    );
  }
}
