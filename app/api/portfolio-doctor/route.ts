import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { marketData } from "@/lib/providers";
import { computeScore } from "@/lib/scoring/score";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { callGemini, geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";

export const dynamic = "force-dynamic";

function isNetErr(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed|UNABLE_TO_GET|network/i.test(m);
}

// Robustly parse the model's JSON. LLMs occasionally emit raw control characters
// inside strings (breaks JSON.parse) or get cut off before the closing braces
// (truncation). We sanitize control chars, then if a straight parse fails we try
// to auto-close any unterminated string/arrays/objects so a truncated-but-mostly
// -complete answer still renders instead of erroring out.
function parseLooseJson(raw: string): any {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in AI response.");
  // Walk the string tracking string/escape/depth so we can (a) escape stray
  // control chars inside strings and (b) know where to truncate + auto-close.
  let out = "";
  let inStr = false;
  let esc = false;
  let depth = 0;
  let lastBalancedEnd = -1; // index in `out` just after the top-level object closed
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const code = ch.charCodeAt(0);
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      // Escape raw control characters (newlines, tabs, etc.) that are illegal in JSON strings.
      if (code < 0x20) {
        out += ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ch === "\r" ? "\\r" : " ";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === "{" || ch === "[") { depth++; out += ch; continue; }
    if (ch === "}" || ch === "]") {
      depth--; out += ch;
      if (depth === 0) lastBalancedEnd = out.length;
      continue;
    }
    out += ch;
  }

  // Try the cleaned-but-complete string first (trim to the last balanced close).
  const candidates: string[] = [];
  if (lastBalancedEnd !== -1) candidates.push(out.slice(0, lastBalancedEnd));
  candidates.push(out);

  // Truncated: close any open string, then close open arrays/objects in order.
  let repaired = out;
  if (inStr) repaired += '"';
  // Re-scan repaired to compute the open-bracket stack.
  const stack: string[] = [];
  let s2 = false, e2 = false;
  for (const ch of repaired) {
    if (s2) { if (e2) { e2 = false; } else if (ch === "\\") { e2 = true; } else if (ch === '"') s2 = false; continue; }
    if (ch === '"') { s2 = true; continue; }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  // Drop a dangling trailing comma before auto-closing.
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length) repaired += stack.pop();
  candidates.push(repaired);

  // Strip trailing commas before } or ] (illegal in JSON, common in LLM output).
  const stripTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");

  let lastErr: unknown;
  for (const c of candidates) {
    for (const variant of [c, stripTrailingCommas(c)]) {
      try { return JSON.parse(variant); } catch (e) { lastErr = e; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Could not parse AI JSON.");
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
- Keep every "reason"/"detail"/"summary" to ONE concise sentence. Cap each horizon's sells and buys at 3 items. This keeps the response complete and parseable.
- Output STRICT JSON only: no markdown fences, no literal newlines inside string values, no trailing commas, no commentary before or after the JSON.
- NEVER use placeholders, ellipses ("..."), "TODO", or "same as above". Every field must contain real, fully-written values. Write out all five horizons in full.
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

  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized", message: "Sign in to run the Portfolio Doctor." }, { status: 401 });
  const { data: rows } = await ctx.supabase.from("holdings").select("*");
  const holdings = (rows ?? []).map((h: any) => ({
    symbol: h.symbol, shares: Number(h.shares), avgCost: Number(h.avg_cost),
    assetType: h.asset_type ?? "stock", source: h.source ?? "manual",
  }));
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

  async function getText(): Promise<{ text: string; ai: "claude" | "gemini"; usedModel: string }> {
    // Smart router: deep-analysis -> Opus 4.8 leads, Gemini Pro fallback.
    const r = await routeText({ task: "deep-analysis", system: SYSTEM, user: prompt, maxTokens: 8000, webSearch: true });
    return { text: r.text, ai: r.provider, usedModel: r.model };
  }

  // Last-resort repair: hand the broken text back to the AI (no tools) and ask
  // for STRICT valid JSON only. Catches semantic breakage our parser can't fix,
  // e.g. the model writing a literal "..." placeholder instead of data.
  async function repairJson(broken: string): Promise<any> {
    const repairPrompt = `The following was supposed to be a single valid JSON object but is malformed (bad control chars, truncation, or placeholders like "..."). Return ONLY the corrected, complete, strict JSON object — no markdown, no commentary, no ellipses or placeholders. If a field was a placeholder, fill it with a reasonable value consistent with the rest.\n\n${broken.slice(0, 20000)}`;
    // Route as "structured" (Gemini Pro leads — best at clean JSON), no web search.
    const r = await routeText({
      task: "structured",
      system: "You repair malformed JSON. Output strict, valid, complete JSON only.",
      user: repairPrompt,
      maxTokens: 8000,
    });
    return parseLooseJson(r.text);
  }

  try {
    const { text, ai, usedModel } = await getText();
    let analysis: any;
    try {
      analysis = parseLooseJson(text);
    } catch {
      // Parser couldn't salvage it (e.g. placeholder ellipses) — ask the AI to fix it.
      analysis = await repairJson(text);
    }

    const aiName = ai === "claude" ? "Claude" : "Gemini";
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
