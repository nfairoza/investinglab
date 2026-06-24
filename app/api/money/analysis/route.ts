import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { computeAdvisor } from "@/lib/advisor/engine";

export const dynamic = "force-dynamic";

// Rukmani narrates spending — what to cut, where freed-up money could go, and
// what to keep an eye on. Numbers are computed by the advisor engine; the AI
// only narrates them and never invents figures or recommends specific products.
const SYSTEM = `You are Rukmani, the rukMoney money coach. You are given a user's spending picture where EVERY number has already been computed. Narrate it — do not calculate.
Strict rules:
- NEVER invent or alter a number. Use only figures present in the input.
- NEVER recommend specific merchants, lenders, securities, or products to buy/sell.
- Be specific, warm, and practical. Reference the user's actual categories/merchants/amounts.
- Education only — not individualized financial advice.
Return ONLY valid JSON (no markdown fences).`;

export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const advisor = await computeAdvisor(ctx);
  const s = advisor.spending;
  if (!s.available) {
    return NextResponse.json({ error: "no_data", message: "Link a checking account to see spending analysis." }, { status: 400 });
  }

  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ analysis: null, spending: s, model: null });
  }

  const prompt = `SPENDING (all numbers pre-computed):
This month — income ${s.monthIncome}, expenses ${s.monthExpenses}, net ${s.net}.
Top categories: ${s.topCategories.map((c) => `${c.category} $${c.amount}`).join(", ") || "none"}.
Top merchants: ${s.topMerchants.map((m) => `${m.merchant} $${m.amount}`).join(", ") || "none"}.
Recurring bills/subscriptions: ${s.recurring.map((r) => `${r.merchant} $${r.amount}/mo (${r.months} mo)`).join(", ") || "none detected"}.
Notable changes vs last month: ${s.movers.map((m) => `${m.category} ${m.deltaPct > 0 ? "+" : ""}${m.deltaPct}%`).join(", ") || "none"}.
Surplus routing: ${advisor.surplus.available ? `${advisor.surplus.surplus} → ${advisor.surplus.destination}` : "unavailable"}.

Return JSON exactly:
{
  "summary": string,            // 1-2 sentences on the overall spending picture
  "cut": [string],              // 2-3 concrete places to consider cutting, citing real categories/merchants/amounts
  "redirect": [string],         // 1-2 ideas for where freed-up or surplus money could go (use the computed surplus destination)
  "watch": [string]             // 1-2 things to keep an eye on (rising categories, large recurring bills, unusual patterns)
}`;

  try {
    const { text, model } = await routeText({ task: "chat-analysis", system: SYSTEM, user: prompt, maxTokens: 1200 });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    const analysis = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned);
    return NextResponse.json({ analysis, spending: s, model });
  } catch {
    return NextResponse.json({ analysis: null, spending: s, model: null });
  }
}
