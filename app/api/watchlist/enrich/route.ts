import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import { callAI } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { getDb, withDbWrite, now } from "@/lib/db";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a skeptical equity analyst writing for a non-expert.
Given live data for a watchlist stock, return a concise JSON analysis with an ideal
buy price, fair value range, bull case, bear case, next catalyst, and an action.
Be realistic — separate "good company" from "good price today". Use ranges, not
false precision. Return ONLY valid JSON (no markdown).`;

// POST /api/watchlist/enrich { id }  → AI-fill ideal buy / fair value / cases /
// catalyst / action for one watchlist item, using live FMP data + web search.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const item = getDb().data.watchlist.find((w) => w.id === id);
  if (!item) return NextResponse.json({ error: "watch item not found" }, { status: 404 });

  const symbol = item.symbol;
  const [quote, fin, analyst, dcf] = await Promise.all([
    marketData.getQuote(symbol),
    marketData.getFinancials(symbol),
    marketData.getAnalystData(symbol),
    marketData.getDcf(symbol),
  ]);

  if (!quote.data && !geminiKey()) {
    return NextResponse.json({ error: `No market data for ${symbol} and no AI fallback.` }, { status: 400 });
  }

  const dataBlock = quote.data
    ? `QUOTE: ${JSON.stringify(quote.data)}
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

  try {
    const { text } = await callAI({ system: SYSTEM, user, maxTokens: 800, webSearch: !quote.data });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const s = cleaned.indexOf("{");
    const e = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(s, e + 1));

    const updated = await withDbWrite((db) => {
      const w = db.data.watchlist.find((x) => x.id === id);
      if (!w) return null;
      if (typeof parsed.idealBuy === "number" && parsed.idealBuy > 0) w.idealBuy = parsed.idealBuy;
      w.fairValue = parsed.fairValue ?? w.fairValue;
      w.bullCase = parsed.bullCase ?? w.bullCase;
      w.bearCase = parsed.bearCase ?? w.bearCase;
      w.catalyst = parsed.catalyst ?? w.catalyst;
      w.aiAction = parsed.aiAction ?? w.aiAction;
      if (parsed.note) w.note = parsed.note;
      w.analyzedAt = now();
      w.updatedAt = now();
      return w;
    });
    return NextResponse.json({ item: updated, source: quote.source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "analysis failed" }, { status: 500 });
  }
}
