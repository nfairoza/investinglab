import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { getUserClient, readSharedPrediction, writeSharedPrediction } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// =============================================================================
// AI PREDICTIONS — Claude researches a stock using live data + a web search for
// recent news, then returns a structured, multi-horizon prediction.
//
// This is NOT a Polymarket/Kalshi odds feed. It is Claude's own analysis,
// explicitly framed as a probabilistic opinion, never a guarantee.
//
// Uses Anthropic's server-side `web_search` tool so the model can pull current
// headlines/sentiment it wasn't trained on.
// =============================================================================

const SYSTEM = `You are a skeptical equity analyst making a probabilistic prediction for a non-expert.
Rules:
- Use the live financial data provided AND search the web for the most recent news, earnings, and sentiment.
- Give predictions for multiple horizons (1 week, 1 month, 1 year) with an explicit DIRECTION (up/down/flat), a CONFIDENCE %, a MAGNITUDE (expected % move, e.g. "+4%" or "-6%"), and a plain-English reason.
- "Up"/"Down" alone is useless — ALWAYS quantify how much: give expectedMovePct for each horizon and a single 12-month dollar priceTarget. These are estimates, never guarantees.
- Always state the single biggest risk to your prediction and what would change your mind.
- No fake precision — use ranges for any price target and label them as estimates.
- Separate "good company" from "good stock at today's price."
- You are giving an opinion, not a guarantee. Markets are uncertain.
Return ONLY valid JSON (no markdown fences) matching the schema given.`;

// Models occasionally return JSON that's truncated (hit the token cap mid-array)
// or has trailing commas. Try a strict parse first, then repair: strip trailing
// commas, and if it's truncated, close any still-open strings/brackets so we can
// recover a partial-but-valid object instead of failing the whole prediction.
function parseLooseJson(raw: string): any {
  try { return JSON.parse(raw); } catch { /* fall through to repair */ }

  // 1) strip trailing commas before } or ]
  let s = raw.replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(s); } catch { /* fall through */ }

  // 2) repair truncation: walk the string tracking strings/escapes + bracket
  // stack, drop a dangling partial token, then close everything still open.
  const stack: string[] = [];
  let inStr = false, esc = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; lastSafe = i + 1; }
      continue;
    }
    if (c === '"') { inStr = true; }
    else if (c === "{" || c === "[") { stack.push(c === "{" ? "}" : "]"); }
    else if (c === "}" || c === "]") { stack.pop(); lastSafe = i + 1; }
    else if (c === "," || /\s/.test(c)) { lastSafe = i + 1; }
  }
  // cut back to the last structurally safe point (drops a half-written value)
  s = s.slice(0, lastSafe).replace(/,(\s*)$/, "");
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i];
  return JSON.parse(s);
}

function buildPrompt(symbol: string, dataBlock: string): string {
  return `Predict the likely direction of ${symbol}.

LIVE DATA (use this; search the web for recent news to supplement):
${dataBlock}

Search the web for: "${symbol} stock news", recent earnings, analyst commentary, and any catalysts in the next few weeks.

Return JSON with this exact shape:
{
  "summary": string,                         // 2-3 sentence overall take
  "horizons": [
    {"horizon":"1 week","direction":"up"|"down"|"flat","confidence":0-100,"reason":string},
    {"horizon":"1 month","direction":"up"|"down"|"flat","confidence":0-100,"reason":string},
    {"horizon":"1 year","direction":"up"|"down"|"flat","confidence":0-100,"reason":string}
  ],
  "priceTargetRange": string,                // e.g. "$180–$210 over 12 months (estimate)"
  "expectedMovePct": {                        // expected % price move per horizon (signed; estimate)
    "oneWeek": number, "oneMonth": number, "oneYear": number
  },
  "priceTarget": number|null,                 // single 12-month price target in dollars (estimate, null if unknown)
  "biggestRisk": string,
  "whatWouldChangeMyMind": string,
  "keyHeadlines": [ {"title":string,"takeaway":string,"url":string} ]  // from your web search, up to 4. url MUST be the real article link you found.
}`;
}

export async function POST(req: NextRequest) {
  // Predictions are market-only and shared across users, but still require a
  // logged-in session (the cache table is authenticated-only).
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const symbol = (body?.symbol as string | undefined)?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const forceRefresh = body?.refresh === true;

  // Serve the shared cache when it's fresh (<2h) unless an explicit refresh was
  // requested. Market-only prediction → identical for every user → reuse it.
  if (!forceRefresh) {
    const cached = await readSharedPrediction(ctx, symbol);
    if (cached && !cached.stale) {
      return NextResponse.json({ ...cached.payload, cached: true, generatedAt: cached.generatedAt });
    }
  }

  const key = resolveApiKey();
  if (!key && !geminiKey()) {
    // No AI key but a stale cache exists → still better than nothing.
    const cached = await readSharedPrediction(ctx, symbol);
    if (cached) return NextResponse.json({ ...cached.payload, cached: true, stale: true, generatedAt: cached.generatedAt });
    return NextResponse.json(
      { error: "no_key", message: "Add a Claude or Gemini API key in Connectors to use AI predictions." },
      { status: 400 },
    );
  }

  // Gather all the live data we can for context.
  const [quote, fin, profile, analyst, dcf] = await Promise.all([
    marketData.getQuote(symbol),
    marketData.getFinancials(symbol),
    marketData.getCompanyProfile(symbol),
    marketData.getAnalystData(symbol),
    marketData.getDcf(symbol),
  ]);

  // No hard block if the FMP feed is down — Claude searches the web for the
  // numbers instead. We just flag the source so the UI can show it.
  const feedLive = quote.source === "live";
  const dataBlock = quote.data
    ? [
        `QUOTE: ${JSON.stringify(quote.data)}`,
        `PROFILE: ${JSON.stringify(profile.data ?? "unavailable")}`,
        `FINANCIALS (recent quarters): ${JSON.stringify(fin.data?.quarters?.slice(-4) ?? "unavailable")}`,
        `ANALYST: ${JSON.stringify(analyst.data ?? "unavailable")}`,
        `DCF: ${JSON.stringify(dcf.data ?? "unavailable")}`,
      ].join("\n")
    : `Live market-data feed unavailable (${quote.note ?? "no data"}). Search the web for ${symbol}'s current price, financials, valuation, and news.`;

  const prompt = buildPrompt(symbol, dataBlock);

  try {
    // Smart router: deep-analysis -> Opus 4.8 leads, Gemini Pro fallback.
    const { text, provider, model: usedModel } = await routeText({
      task: "deep-analysis",
      system: SYSTEM,
      user: prompt,
      maxTokens: 4096,
      webSearch: true,
    });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
    const prediction = parseLooseJson(jsonStr);

    const aiName = provider === "claude" ? "Claude" : "Gemini";
    const payload = {
      symbol,
      prediction,
      dataSource: feedLive ? "live" : "demo",
      sourceLabel: feedLive
        ? `FMP live data + ${aiName} web search`
        : `${aiName} web search (FMP feed unavailable)`,
      asOf: quote.asOf,
      model: usedModel,
    };

    // Save to the shared cache so the next viewer (any user) reuses it for ~2h.
    const generatedAt = await writeSharedPrediction(ctx, symbol, payload, usedModel).catch(
      () => new Date().toISOString(),
    );

    return NextResponse.json({ ...payload, cached: false, generatedAt });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", message: e instanceof Error ? e.message : "Prediction failed" },
      { status: 500 },
    );
  }
}
