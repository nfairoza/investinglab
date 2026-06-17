import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { marketData } from "@/lib/providers";
import { computeScore } from "@/lib/scoring/score";
import { resolveApiKey, resolveModel } from "@/lib/ai/anthropic";
import { callGemini, geminiKey, geminiModel } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

function isNetErr(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|UNABLE_TO_GET|network/i.test(m);
}

// Horizons the doctor must give buy/sell guidance for.
const HORIZONS = ["1 day", "1 month", "6 months", "1 year", "5 years"] as const;

const SYSTEM = `You are a portfolio doctor: a skeptical, fiduciary-minded investment advisor doing a full check-up on a real person's portfolio.
Your job:
1. Diagnose portfolio HEALTH: concentration (single-stock and sector), diversification, risk, cash drag, correlation, and any obvious problems.
2. For EACH holding, give a clear action (Buy more / Hold / Trim / Sell) with a SPECIFIC dollar or share amount and a one-line reason.
3. Recommend NEW positions to buy (anything in the market, not just current holdings) when it improves the portfolio.
4. Do ALL of the above across FIVE separate time horizons: 1 day, 1 month, 6 months, 1 year, 5 years. A day-trade view and a 5-year view are very different — treat them differently.
Rules:
- Use the live data provided AND search the web for recent news, earnings, and catalysts.
- Be specific and quantified: "Sell ~$3,000 of NVDA" / "Add ~10 shares of COST", not "consider trimming."
- Amounts should be realistic relative to the portfolio's total value given below.
- Always state the single biggest portfolio-level risk.
- Separate "good company" from "good price today." No fake precision — ranges are fine, label estimates.
- You are giving an opinion, not a guarantee.
Return ONLY valid JSON (no markdown fences) matching the schema given.`;

function buildPrompt(portfolioBlock: string, totalValue: number): string {
  return `Here is the portfolio to examine. Total value ≈ $${totalValue.toFixed(0)}.

${portfolioBlock}

Search the web for recent news/catalysts on the largest holdings and anything you'd recommend buying.

Return JSON with EXACTLY this shape:
{
  "healthScore": 0-100,                       // overall portfolio health
  "healthGrade": "A"|"B"|"C"|"D"|"F",
  "summary": string,                          // 2-4 sentence plain-English diagnosis
  "biggestRisk": string,
  "diagnostics": [                            // concrete findings
    {"title": string, "severity": "good"|"watch"|"warning", "detail": string}
  ],
  "concentration": {
    "topPositionPct": number,                 // % of portfolio in the single largest position
    "topSectorPct": number,                   // % in the largest sector
    "note": string
  },
  "horizons": [                              // ONE object per horizon: 1 day, 1 month, 6 months, 1 year, 5 years
    {
      "horizon": "1 day"|"1 month"|"6 months"|"1 year"|"5 years",
      "stance": string,                       // one-line overall posture for this horizon
      "sells": [ {"symbol": string, "action": "Sell"|"Trim", "amountUsd": number, "shares": number|null, "reason": string} ],
      "buys":  [ {"symbol": string, "action": "Buy"|"Add", "amountUsd": number, "shares": number|null, "reason": string, "isNew": boolean} ]
    }
  ]
}
Include all five horizons. For each horizon, sells should come from current holdings; buys may include current holdings (Add) or brand-new tickers (isNew:true). Keep each list to the 1-4 highest-conviction moves.`;
}

export async function POST() {
  const key = resolveApiKey();
  if (!key && !geminiKey()) {
    return NextResponse.json(
      { error: "no_key", message: "Add a Claude or Gemini API key in Connectors to run the Portfolio Doctor." },
      { status: 400 },
    );
  }

  const db = getDb();
  const holdings = db.data.holdings ?? [];
  if (!holdings.length) {
    return NextResponse.json(
      { error: "no_holdings", message: "Add holdings (or sync a broker) first — the doctor needs a portfolio to examine." },
      { status: 400 },
    );
  }

  // Gather live quote + score + sector for each holding.
  const enriched = await Promise.all(
    holdings.map(async (h) => {
      const [quote, financials, technicals, earnings, profile] = await Promise.all([
        marketData.getQuote(h.symbol),
        marketData.getFinancials(h.symbol),
        marketData.getTechnicals(h.symbol),
        marketData.getEarningsDate(h.symbol),
        marketData.getCompanyProfile(h.symbol),
      ]);
      const price = quote.data?.price ?? null;
      const value = price != null ? price * h.shares : h.avgCost * h.shares;
      const score = quote.data
        ? computeScore({ quote: quote.data, financials: financials.data, technicals: technicals.data, earnings: earnings.data })
        : null;
      return {
        symbol: h.symbol,
        shares: h.shares,
        avgCost: h.avgCost,
        assetType: h.assetType ?? "stock",
        source: h.source ?? "manual",
        price,
        value,
        changePct: quote.data?.changePct ?? null,
        sector: profile.data?.sector ?? "Unknown",
        score: score?.overall ?? null,
        scoreLabel: score?.label ?? null,
        horizons: score?.horizons ?? null,
        topReason: score?.topReason ?? null,
        majorRisk: score?.majorRisk ?? null,
        feedLive: quote.source === "live",
      };
    }),
  );

  const totalValue = enriched.reduce((s, h) => s + (h.value ?? 0), 0);
  const anyLive = enriched.some((h) => h.feedLive);

  // Sector + concentration stats (deterministic — given to the AI as ground truth).
  const sectorTotals = new Map<string, number>();
  for (const h of enriched) sectorTotals.set(h.sector, (sectorTotals.get(h.sector) ?? 0) + (h.value ?? 0));
  const weights = enriched
    .map((h) => ({ ...h, weightPct: totalValue > 0 ? ((h.value ?? 0) / totalValue) * 100 : 0 }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const portfolioBlock = [
    `HOLDINGS (${enriched.length} positions):`,
    ...weights.map(
      (h) =>
        `  ${h.symbol} [${h.assetType}] — ${h.shares} sh @ avg $${h.avgCost.toFixed(2)} | now $${h.price?.toFixed(2) ?? "?"} | value $${(h.value ?? 0).toFixed(0)} (${h.weightPct.toFixed(1)}% of portfolio) | sector ${h.sector} | today ${h.changePct?.toFixed(2) ?? "?"}% | score ${h.score?.toFixed(0) ?? "n/a"} (${h.scoreLabel ?? "n/a"}) | why: ${h.topReason ?? "n/a"} | risk: ${h.majorRisk ?? "n/a"}`,
    ),
    "",
    "SECTOR EXPOSURE:",
    ...Array.from(sectorTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sec, val]) => `  ${sec}: $${val.toFixed(0)} (${totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : "0"}%)`),
  ].join("\n");

  const prompt = buildPrompt(portfolioBlock, totalValue);

  async function getText(): Promise<{ text: string; ai: "claude" | "gemini" }> {
    if (key) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: resolveModel(),
            max_tokens: 4096,
            system: SYSTEM,
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
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
    const text = await callGemini({ system: SYSTEM, user: prompt, webSearch: true });
    return { text, ai: "gemini" };
  }

  try {
    const { text, ai } = await getText();
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
    const analysis = JSON.parse(jsonStr);

    const aiName = ai === "claude" ? "Claude" : "Gemini";
    const usedModel = ai === "claude" ? resolveModel() : geminiModel();
    return NextResponse.json({
      analysis,
      // Ground-truth portfolio facts (deterministic) so the UI can show real numbers.
      portfolio: {
        totalValue,
        positions: weights.map((h) => ({
          symbol: h.symbol,
          value: h.value,
          weightPct: h.weightPct,
          price: h.price,
          changePct: h.changePct,
          shares: h.shares,
          sector: h.sector,
          score: h.score,
          scoreLabel: h.scoreLabel,
        })),
        sectors: Array.from(sectorTotals.entries())
          .map(([sector, value]) => ({ sector, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
          .sort((a, b) => b.value - a.value),
      },
      dataSource: anyLive ? "live" : "demo",
      sourceLabel: anyLive ? `FMP live data + ${aiName} web search` : `${aiName} web search (FMP feed unavailable)`,
      model: usedModel,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", message: e instanceof Error ? e.message : "Portfolio analysis failed" },
      { status: 500 },
    );
  }
}
