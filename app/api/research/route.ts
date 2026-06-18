import { NextRequest, NextResponse } from "next/server";
import { marketData } from "@/lib/providers";
import type { DataResult } from "@/lib/providers/types";
import type { ResearchReport } from "@/lib/research/types";
import { SECTION_PLAN } from "@/lib/research/types";
import { aiStatus } from "@/lib/ai/anthropic";
import { routeText } from "@/lib/ai/router";

export const dynamic = "force-dynamic";

// =============================================================================
// RESEARCH ENGINE — uses Anthropic Claude.
//   GET  /api/research?symbol=AAPL  -> latest stored memo (no DB yet => "generate one")
//   POST /api/research { symbol }   -> pull live data, run Claude, return the memo
//
// Honesty rules enforced here:
//   - no AI key  -> source "unavailable" ("add your Claude key in Settings")
//   - no data    -> source "unavailable" (don't analyse on top of missing data)
//   - the memo's source follows the DATA: live data => "live", demo data => "demo"
// Persistence (store/read research_reports) is wired in Phase 2.5/5 — see TODOs.
// =============================================================================

const SYSTEM = `You are a senior equity analyst AND a patient finance teacher writing for a non-expert.
Follow these rules without exception:
- Be skeptical, not promotional. Do not assume a high-quality company is automatically a good stock; separate "good company" from "good stock".
- Do not treat AI exposure as automatically positive — weigh monetization AND competitive threat.
- Compare the expectations embedded in the valuation against realistic outcomes.
- No fake precision: use ranges. State the data date. Note if data is delayed or unavailable.
- Always explain the downside, and always state what would change the recommendation.
- Identify the single most important variable, the biggest hidden risk, and the most misunderstood upside driver.
- Before the final verdict, self-challenge ("what could I be missing?") and revise.
- For every section, give a "pro" version (concise, jargon ok) and a "beginner" version (plain English, simple analogies, define every term inline).
Return ONLY valid JSON (no markdown, no backticks) matching the schema you are given.`;

function buildUserPrompt(symbol: string, quoteJson: string, finJson: string): string {
  const ids = SECTION_PLAN.map((s) => `${s.id}: ${s.title}`).join("; ");
  return `Write a research memo for ticker ${symbol}.

LIVE DATA (use this; do not invent numbers beyond it):
QUOTE: ${quoteJson}
FINANCIALS (oldest->newest quarters): ${finJson}

Produce JSON with this exact shape:
{
  "rating": one of ["Buy","Buy gradually","Hold","Wait","Avoid","Sell"],
  "confidence": integer 0-100,
  "oneLineThesis": string,
  "biggestRisk": string,
  "sections": [ {"id":"A","title":"Executive Summary","pro":string,"beginner":string}, ... one object for EACH of: ${ids} ],
  "scenarios": [ {"label":"Bull","probabilityPct":number|null,"impliedPriceLow":number|null,"impliedPriceHigh":number|null,"expectedReturnPct":number|null,"assumptions":string}, ... also Base, Bear, "Severe Downside" ],
  "actionTable": {
    "currentPrice":string,"costBasis":"—","gainLoss":"—","fairValueRange":string,"addBelow":string,
    "trimAbove":string,"sellInvalidation":string,"upsidePotential":string,"downsideRisk":string,
    "riskReward":string,"finalAction":string,"confidence":string,"mainReason":string,
    "biggestRisk":string,"nextCatalyst":string,"dataAsOf":string
  }
}
Keep each section a few sentences. Ranges, not false precision.`;
}

function unavailable(symbol: string, note: string): DataResult<ResearchReport> {
  return { data: null, source: "unavailable", asOf: null, provider: "anthropic", note };
}

// Coerce whatever Claude returned into a full ResearchReport.
function toReport(symbol: string, parsed: Partial<ResearchReport>, dataAsOf: string): ResearchReport {
  return {
    symbol,
    rating: parsed.rating ?? "Hold",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
    oneLineThesis: parsed.oneLineThesis ?? "",
    biggestRisk: parsed.biggestRisk ?? "",
    sections: parsed.sections ?? [],
    scenarios: parsed.scenarios ?? [],
    actionTable:
      parsed.actionTable ??
      ({
        currentPrice: "—", costBasis: "—", gainLoss: "—", fairValueRange: "—", addBelow: "—",
        trimAbove: "—", sellInvalidation: "—", upsidePotential: "—", downsideRisk: "—",
        riskReward: "—", finalAction: parsed.rating ?? "Hold", confidence: "—", mainReason: "—",
        biggestRisk: parsed.biggestRisk ?? "—", nextCatalyst: "—", dataAsOf,
      } as ResearchReport["actionTable"]),
    dataAsOf,
    generatedAt: new Date().toISOString(),
  };
}

// Fallback: when FMP data is unavailable (rate-limited / no key), have Claude
// research the ticker via web search instead. Returns the parsed JSON memo.
async function generateFromWeb(symbol: string): Promise<Partial<ResearchReport>> {
  const ids = SECTION_PLAN.map((s) => `${s.id}: ${s.title}`).join("; ");
  const user = `Write a research memo for ticker ${symbol}.
Live market-data feed is unavailable, so SEARCH THE WEB for current price, financials, valuation, and recent news for ${symbol}. State the data is from web search and may be delayed.

Produce JSON with this exact shape:
{
  "rating": one of ["Buy","Buy gradually","Hold","Wait","Avoid","Sell"],
  "confidence": integer 0-100,
  "oneLineThesis": string,
  "biggestRisk": string,
  "sections": [ {"id":"A","title":"Executive Summary","pro":string,"beginner":string}, ... one object for EACH of: ${ids} ],
  "scenarios": [ {"label":"Bull","probabilityPct":number|null,"impliedPriceLow":number|null,"impliedPriceHigh":number|null,"expectedReturnPct":number|null,"assumptions":string}, ... also Base, Bear, "Severe Downside" ],
  "actionTable": { "currentPrice":string,"costBasis":"—","gainLoss":"—","fairValueRange":string,"addBelow":string,"trimAbove":string,"sellInvalidation":string,"upsidePotential":string,"downsideRisk":string,"riskReward":string,"finalAction":string,"confidence":string,"mainReason":string,"biggestRisk":string,"nextCatalyst":string,"dataAsOf":string }
}
Return ONLY the JSON.`;

  // Smart router with web search: deep-analysis -> Opus leads, Gemini fallback.
  const { text } = await routeText({ task: "deep-analysis", system: SYSTEM, user, maxTokens: 4096, webSearch: true });
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  return JSON.parse(text.slice(s, e + 1)) as Partial<ResearchReport>;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  // TODO (Phase 2.5/5): read latest stored memo for auth.uid()+symbol from
  // research_reports and return it. Until persistence exists, report none.
  return NextResponse.json(unavailable(symbol, "No saved research yet — click Generate."));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = (body?.symbol as string | undefined)?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  if (!aiStatus().configured) {
    return NextResponse.json(
      unavailable(symbol, "No Claude API key configured. Add it in Settings, or set ANTHROPIC_API_KEY."),
    );
  }

  // Pull the data the memo will reason over. With Starter we can give Claude the
  // full picture: quote, financials, technicals, analyst targets, and DCF.
  const [quote, fin, tech, analyst, dcf] = await Promise.all([
    marketData.getQuote(symbol),
    marketData.getFinancials(symbol),
    marketData.getTechnicals(symbol),
    marketData.getAnalystData(symbol),
    marketData.getDcf(symbol),
  ]);

  // ── Path A: live/demo FMP data available → build memo on it ──────────────
  if (quote.data) {
    try {
      const extra = `TECHNICALS: ${JSON.stringify(tech.data ?? "unavailable")}
ANALYST: ${JSON.stringify(analyst.data ?? "unavailable")}
DCF: ${JSON.stringify(dcf.data ?? "unavailable")}`;
      // Smart router: research memo is deep analysis -> Opus 4.8 leads, with
      // web search, Gemini Pro fallback.
      const { text: raw, provider: prov, model: usedModel } = await routeText({
        task: "deep-analysis",
        system: SYSTEM,
        user: buildUserPrompt(symbol, JSON.stringify(quote.data), JSON.stringify(fin.data ?? null)) + "\n\n" + extra,
        maxTokens: 4096,
        webSearch: true,
      });
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const sIdx = cleaned.indexOf("{");
      const eIdx = cleaned.lastIndexOf("}");
      const parsed = JSON.parse(sIdx !== -1 && eIdx !== -1 ? cleaned.slice(sIdx, eIdx + 1) : cleaned) as Partial<ResearchReport>;
      const report = toReport(symbol, parsed, quote.asOf ?? new Date().toISOString());

      const result: DataResult<ResearchReport> = {
        data: report,
        source: quote.source === "live" ? "live" : "demo",
        asOf: report.generatedAt,
        provider: `${prov}:${usedModel}`,
        note:
          quote.source === "live"
            ? undefined
            : "Built on demo market data — add a market-data API key for live figures.",
      };
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(unavailable(symbol, e instanceof Error ? e.message : "generation failed"));
    }
  }

  // ── Path B: FMP unavailable (rate-limited / no key) → web-search fallback ──
  try {
    const parsed = await generateFromWeb(symbol);
    const report = toReport(symbol, parsed, new Date().toISOString());
    const result: DataResult<ResearchReport> = {
      data: report,
      source: "demo", // not from the live market-data feed
      asOf: report.generatedAt,
      provider: "ai-websearch",
      note: `Market-data feed unavailable (${quote.note ?? "no data"}). This memo was built from AI web search — figures may be delayed; verify before acting.`,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(unavailable(symbol, e instanceof Error ? e.message : "generation failed"));
  }
}
