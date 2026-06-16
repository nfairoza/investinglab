import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { resolveApiKey, resolveModel } from "@/lib/ai/anthropic";

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
  if (!key) {
    return NextResponse.json(
      { error: "no_key", message: "Add a Claude API key in Connectors to use AI predictions." },
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

  if (!quote.data) {
    return NextResponse.json(
      { error: "no_data", message: `No market data for ${symbol} — check the ticker or your FMP key.` },
      { status: 400 },
    );
  }

  const dataBlock = [
    `QUOTE: ${JSON.stringify(quote.data)}`,
    `PROFILE: ${JSON.stringify(profile.data ?? "unavailable")}`,
    `FINANCIALS (recent quarters): ${JSON.stringify(fin.data?.quarters?.slice(-4) ?? "unavailable")}`,
    `ANALYST: ${JSON.stringify(analyst.data ?? "unavailable")}`,
    `DCF: ${JSON.stringify(dcf.data ?? "unavailable")}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: resolveModel(),
        max_tokens: 2048,
        system: SYSTEM,
        // Give Claude the web_search tool so it can pull current news.
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        messages: [{ role: "user", content: buildPrompt(symbol, dataBlock) }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: "anthropic_error", message: `AI error ${res.status}: ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    // Concatenate all text blocks (web_search interleaves tool blocks).
    const text = (json.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");

    const cleaned = text.replace(/```json|```/g, "").trim();
    // The model may include prose around the JSON; extract the first {...} block.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
    const prediction = JSON.parse(jsonStr);

    return NextResponse.json({
      symbol,
      prediction,
      dataSource: quote.source, // live | demo
      asOf: quote.asOf,
      model: resolveModel(),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", message: e instanceof Error ? e.message : "Prediction failed" },
      { status: 500 },
    );
  }
}
