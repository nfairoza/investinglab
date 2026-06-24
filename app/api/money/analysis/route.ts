import { NextRequest, NextResponse } from "next/server";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { computeAdvisor } from "@/lib/advisor/engine";
import { computeMoneyInsights } from "@/lib/money/insights";

export const dynamic = "force-dynamic";

const CACHE_KEY = "money_doctor";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h — Money Doctor is cached for a day to save tokens.

// Rukmani is the "Money Doctor": she reviews the user's whole money picture —
// spending, recurring bills, cash, and debt — and gives recommendations. Every
// number is computed by the advisor engine; the AI only narrates them.
const SYSTEM = `You are Rukmani, the rukMoney "Money Doctor". You are given a user's complete MONEY picture (spending, recurring bills, cash runway, surplus, and debts) where EVERY number has already been computed. Narrate and advise — do not calculate.
Strict rules:
- NEVER invent or alter a number. Use only figures present in the input.
- NEVER recommend specific merchants, lenders, securities, or products to buy/sell.
- Be specific, warm, and practical. Reference the user's actual categories/merchants/amounts/APRs.
- Education only — not individualized financial advice.
Return ONLY valid JSON (no markdown fences).`;

function buildPrompt(advisor: Awaited<ReturnType<typeof computeAdvisor>>, insights: Awaited<ReturnType<typeof computeMoneyInsights>>): string {
  const s = advisor.spending;
  const debtStep = advisor.steps.find((x) => x.id === "high_interest_debt");
  const efStep = advisor.steps.find((x) => x.id === "emergency_fund");
  const billChanges = insights.billChanges.map((b) => `${b.merchant} ${b.direction === "up" ? "hiked" : "dropped"} from $${b.previousAmount} to $${b.newAmount} (${b.deltaPct > 0 ? "+" : ""}${b.deltaPct}%) after ${b.stableMonths} steady months`).join("; ");
  const anomalies = insights.categoryAnomalies.map((a) => a.isNew ? `${a.category} new this month $${a.thisMonth}` : `${a.category} $${a.thisMonth} vs usual ~$${a.typicalMonth} (${a.deltaPct > 0 ? "+" : ""}${a.deltaPct}%)`).join("; ");
  return `MONEY PICTURE (all numbers pre-computed):
Cash on hand: ${advisor.liquidCash}. Avg monthly expenses: ${advisor.avgMonthlyExpenses ?? "unknown"}.
This month — income ${s.monthIncome}, expenses ${s.monthExpenses}, net ${s.net}.
Top categories: ${s.topCategories.map((c) => `${c.category} $${c.amount}`).join(", ") || "none"}.
Top merchants: ${s.topMerchants.map((m) => `${m.merchant} $${m.amount}`).join(", ") || "none"}.
Recurring bills/subscriptions: ${s.recurring.map((r) => `${r.merchant} $${r.amount}/mo (${r.months} mo)`).join(", ") || "none detected"}.
Notable changes vs last month: ${s.movers.map((m) => `${m.category} ${m.deltaPct > 0 ? "+" : ""}${m.deltaPct}%`).join(", ") || "none"}.
Recurring-bill price changes (stable then stepped): ${billChanges || "none detected"}.
Category anomalies (this month vs your own typical): ${anomalies || "none detected"}.
Emergency fund: ${efStep?.mathSummary || efStep?.status || "unknown"}.
Debt: ${debtStep?.computedFacts.map((f) => `${f.label} ${f.value}`).join(", ") || "no debt linked"}. ${debtStep?.mathSummary || ""}
Surplus routing: ${advisor.surplus.available ? `${advisor.surplus.surplus} → ${advisor.surplus.destination} (${advisor.surplus.rationale})` : "unavailable"}.

Return JSON exactly:
{
  "summary": string,            // 2-3 sentences: overall money health read
  "cut": [string],              // 2-3 concrete places to consider cutting, citing real categories/merchants/amounts
  "redirect": [string],         // 1-2 ideas for where freed-up or surplus money could go (use the computed surplus destination)
  "watch": [string],            // 1-2 things to keep an eye on (rising categories, large recurring bills, unusual patterns)
  "alarming": [string],         // 0-2 genuinely concerning items (high-APR debt, runway below 1 month, spending > income) — empty array if none
  "ideas": [string]             // 1-3 forward-looking ideas/opportunities to improve the money picture
}`;
}

async function generate(ctx: NonNullable<Awaited<ReturnType<typeof getUserClient>>>) {
  const [advisor, insights] = await Promise.all([computeAdvisor(ctx), computeMoneyInsights(ctx)]);
  const s = advisor.spending;
  if (!s.available && advisor.liquidCash === 0) {
    return { error: "no_data" as const };
  }
  if (!resolveApiKey() && !geminiKey()) {
    return { analysis: null, advisorMeta: { liquidCash: advisor.liquidCash }, model: null, generatedAt: new Date().toISOString() };
  }
  try {
    const { text, model } = await routeText({ task: "chat-analysis", system: SYSTEM, user: buildPrompt(advisor, insights), maxTokens: 1500 });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    const analysis = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned);
    return { analysis, spending: s, model, generatedAt: new Date().toISOString() };
  } catch {
    return { analysis: null, spending: s, model: null, generatedAt: new Date().toISOString() };
  }
}

// GET — return the cached Money Doctor result if fresh (<24h). No AI tokens spent.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cached = await readAiCache(ctx, CACHE_KEY);
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS) {
    return NextResponse.json({ cached: true, ...(cached.data as object), generatedAt: cached.generatedAt });
  }
  return NextResponse.json({ cached: false, data: cached?.data ?? null, generatedAt: cached?.generatedAt ?? null });
}

// POST — run a fresh Money Doctor analysis, cache it 24h, return it.
export async function POST(_req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await generate(ctx);
  if ("error" in result && result.error === "no_data") {
    return NextResponse.json({ error: "no_data", message: "Link a checking account to get a Money Doctor checkup." }, { status: 400 });
  }
  await writeAiCache(ctx, CACHE_KEY, { generatedAt: result.generatedAt!, data: result });
  return NextResponse.json({ cached: false, ...result });
}
