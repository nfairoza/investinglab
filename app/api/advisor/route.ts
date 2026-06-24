import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { computeAdvisor, type AdvisorResult } from "@/lib/advisor/engine";

export const dynamic = "force-dynamic";

// Rukmani narrates ONLY the computed facts. She must not invent numbers, APRs,
// percentages, rankings, or recommend specific securities/trades. If a step is
// missing data, she says so rather than guessing.
const SYSTEM = `You are Rukmani, the rukMoney finance coach. You are given a user's financial picture where EVERY number (dollar amounts, APRs, months of runway, rankings) has ALREADY been computed for you by rukMoney. Your job is to narrate, encourage, and teach — NOT to calculate.

Strict rules:
- NEVER invent or change a number, APR, percentage, balance, or ranking. Only use figures present in the input.
- NEVER recommend specific securities, tickers, funds, lenders, or trades ("buy/sell X"). Education and observations only.
- If a step is marked missing_data, acknowledge what's missing and invite the user to add it — do not guess.
- Be warm, concise, and concrete. Reference the user's actual computed figures.
- This is education, NOT individualized financial, investment, or tax advice. Never guarantee outcomes.
Return ONLY valid JSON (no markdown fences) matching the requested schema.`;

function buildPrompt(result: AdvisorResult): string {
  const steps = result.steps.map((s) =>
    `- [${s.id}] ${s.title} — status=${s.status}, priority=${s.priority}\n  facts: ${s.computedFacts.map((f) => `${f.label}=${f.value}`).join("; ") || "none"}\n  math: ${s.mathSummary || "n/a"}\n  basis: ${s.explanationInput}${s.missingData ? `\n  missing: ${s.missingData.join("; ")}` : ""}`
  ).join("\n");
  const surplus = result.surplus.available
    ? `income=${result.surplus.income}, expenses=${result.surplus.expenses}, surplus=${result.surplus.surplus}, destination=${result.surplus.destination}. rationale: ${result.surplus.rationale}`
    : `unavailable. ${result.surplus.missing}`;
  const spend = result.spending.available
    ? `month income=${result.spending.monthIncome}, expenses=${result.spending.monthExpenses}, net=${result.spending.net}; top categories: ${result.spending.topCategories.map((c) => `${c.category} $${c.amount}`).join(", ")}; recurring: ${result.spending.recurring.map((r) => `${r.merchant} $${r.amount}/mo`).join(", ") || "none detected"}; movers: ${result.spending.movers.map((m) => `${m.category} ${m.deltaPct > 0 ? "+" : ""}${m.deltaPct}%`).join(", ") || "none"}`
    : "no linked transactions";

  return `USER FINANCIAL PICTURE (all numbers pre-computed):
NET WORTH: ${result.netWorth} (assets ${result.totalAssets}, liabilities ${result.totalLiabilities})
LIQUID CASH: ${result.liquidCash}
AVG MONTHLY EXPENSES: ${result.avgMonthlyExpenses ?? "unknown"}

ORDER-OF-OPERATIONS STEPS:
${steps}

SURPLUS ROUTING: ${surplus}

SPENDING: ${spend}

Return JSON exactly:
{
  "headline": string,                 // one warm sentence on the overall picture
  "summary": string,                  // 2-3 sentences narrating the most important computed facts
  "stepNarration": { "<step id>": string },  // 1-2 sentence plain-English narration per step id above, using ONLY its computed facts
  "surplusNote": string,              // narrate the surplus routing (or the missing-data state)
  "spendingNote": string              // one observation from the spending data (or "" if none)
}`;
}

// GET — computed advisor result ONLY (no AI tokens). Used by the Overview
// compact insight card and any cheap polling. Never calls the AI provider.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await computeAdvisor(ctx);
  return NextResponse.json({ result, narration: null, model: null });
}

export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Deterministic compute — ALL numbers here, never from the AI.
  const result = await computeAdvisor(ctx);

  if (!result.hasAnyData) {
    return NextResponse.json({
      error: "no_data",
      message: "Connect a bank or add holdings so Rukmani can review your finances.",
      result,
    }, { status: 400 });
  }

  // 2) Optional AI narration. If no key or AI fails, return computed cards alone.
  let narration: any = null;
  let model: string | null = null;
  if (resolveApiKey() || geminiKey()) {
    try {
      const { text, model: m } = await routeText({
        task: "chat-analysis",
        system: SYSTEM,
        user: buildPrompt(result),
        maxTokens: 1800,
      });
      const cleaned = text.replace(/```json|```/g, "").trim();
      const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
      narration = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned);
      model = m;
    } catch {
      narration = null; // graceful: computed cards still render
    }
  }

  return NextResponse.json({ result, narration, model });
}
