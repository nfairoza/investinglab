import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { resolveApiKey, resolveModel } from "@/lib/ai/anthropic";
import { callGemini, geminiKey, geminiModel } from "@/lib/ai/gemini";

function isNetErr(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|UNABLE_TO_GET|network/i.test(m);
}

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
- Give predictions for multiple horizons (1 week, 1 month, 1 year) with an explicit DIRECTION (up/down/flat), a CONFIDENCE %, and a plain-English reason.
- Always state the single biggest risk to your prediction and what would change your mind.
- No fake precision — use ranges for any price target and label them as estimates.
- Separate "good company" from "good stock at today's price."
- You are giving an opinion, not a guarantee. Markets are uncertain.
Return ONLY valid JSON (no markdown fences) matching the schema given.`;

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
  "biggestRisk": string,
  "whatWouldChangeMyMind": string,
  "keyHeadlines": [ {"title":string,"takeaway":string} ]  // from your web search, up to 4
}`;
}

export async function POST(req: NextRequest) {
  const key = resolveApiKey();
  if (!key && !geminiKey()) {
    return NextResponse.json(
      { error: "no_key", message: "Add a Claude or Gemini API key in Connectors to use AI predictions." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const symbol = (body?.symbol as string | undefined)?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

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

  // Get the raw model text — try Claude (with web_search), fall back to Gemini
  // (with google_search grounding) on a network failure or if no Claude key.
  async function getText(): Promise<{ text: string; ai: "claude" | "gemini" }> {
    if (key) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: resolveModel(),
            max_tokens: 2048,
            system: SYSTEM,
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
            messages: [{ role: "user", content: prompt }],
          }),
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
          const text = (json.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text as string).join("\n");
          return { text, ai: "claude" };
        }
        if (!geminiKey()) throw new Error(`AI error ${res.status}`);
      } catch (e) {
        if (!geminiKey() || !isNetErr(e)) throw e;
      }
    }
    // Gemini with web grounding
    const text = await callGemini({ system: SYSTEM, user: prompt, webSearch: true });
    return { text, ai: "gemini" };
  }

  try {
    const { text, ai } = await getText();
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
    const prediction = JSON.parse(jsonStr);

    const aiName = ai === "claude" ? "Claude" : "Gemini";
    const usedModel = ai === "claude" ? resolveModel() : geminiModel();
    return NextResponse.json({
      symbol,
      prediction,
      dataSource: feedLive ? "live" : "demo",
      sourceLabel: feedLive
        ? `FMP live data + ${aiName} web search`
        : `${aiName} web search (FMP feed unavailable)`,
      asOf: quote.asOf,
      model: usedModel,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", message: e instanceof Error ? e.message : "Prediction failed" },
      { status: 500 },
    );
  }
}
