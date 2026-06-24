import { NextRequest, NextResponse } from "next/server";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";
import { computeAdvisor, type AdvisorResult } from "@/lib/advisor/engine";

export const dynamic = "force-dynamic";

const CACHE_KEY = "advisor";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RUNS_PER_DAY = 3;

// Daytime guard: don't auto-refresh while people are asleep. Local server hours;
// treat 7:00–22:00 as "awake hours".
function isDaytime(d = new Date()): boolean {
  const h = d.getHours();
  return h >= 7 && h < 22;
}

// A signature of the inputs that materially change advice. If this changes vs
// the cached run, a refresh is warranted (within the daily cap).
function advisorSignature(r: AdvisorResult): string {
  return [
    Math.round(r.netWorth), Math.round(r.totalLiabilities), Math.round(r.liquidCash),
    Math.round(r.avgMonthlyExpenses ?? 0),
    r.surplus.available ? Math.round(r.surplus.surplus) : "na",
    r.steps.map((s) => `${s.id}:${s.status}`).join(","),
  ].join("|");
}

function sameDay(a: string | number | Date, b = new Date()): boolean {
  const d = new Date(a);
  return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
}

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

// Run the AI narration for a computed result (spends tokens). Returns narration
// + model, or nulls on failure (computed cards still render).
async function narrate(result: AdvisorResult): Promise<{ narration: any; model: string | null }> {
  if (!resolveApiKey() && !geminiKey()) return { narration: null, model: null };
  try {
    const { text, model } = await routeText({ task: "chat-analysis", system: SYSTEM, user: buildPrompt(result), maxTokens: 1800 });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    const narration = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned);
    return { narration, model };
  } catch {
    return { narration: null, model: null };
  }
}

// GET — the user-facing path. Returns the cached daily review WITHOUT spending
// tokens, and AUTO-GENERATES the review when warranted so users never have to
// click "review": (a) no cache yet, or (b) the inputs materially changed AND
// it's daytime AND we're under the 3-runs/day cap. Always recomputes the exact
// numbers (free); only the AI narration is rate-limited.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await computeAdvisor(ctx);
  const cached = await readAiCache(ctx, CACHE_KEY);
  const c = cached?.data as any;
  const sig = advisorSignature(result);

  // Reset the daily run counter when the calendar day rolls over.
  const runsToday = c && c.lastRunAt && sameDay(c.lastRunAt) ? (c.runsToday ?? 0) : 0;

  let narration = c?.narration ?? null;
  let model = c?.model ?? null;
  let generatedAt = cached?.generatedAt ?? null;

  const needsFirst = !c?.narration && result.hasAnyData;
  const changed = c?.signature && c.signature !== sig;
  const canAutoRun = needsFirst || (changed && isDaytime() && runsToday < MAX_RUNS_PER_DAY);

  if (canAutoRun && result.hasAnyData) {
    const out = await narrate(result);
    if (out.narration) {
      narration = out.narration; model = out.model; generatedAt = new Date().toISOString();
      await writeAiCache(ctx, CACHE_KEY, {
        generatedAt,
        data: { narration, model, signature: sig, lastRunAt: generatedAt, runsToday: runsToday + 1 },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ result, narration, model, generatedAt, cached: !canAutoRun });
}

// POST — explicit refresh. Admin-only force ignores the cap; for everyone else
// it respects the same daytime + 3/day cap as the auto path.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await computeAdvisor(ctx);
  if (!result.hasAnyData) {
    return NextResponse.json({ error: "no_data", message: "Connect a bank or add holdings so Rukmani can review your finances.", result }, { status: 400 });
  }

  const cached = await readAiCache(ctx, CACHE_KEY);
  const c = cached?.data as any;
  const sig = advisorSignature(result);
  const runsToday = c && c.lastRunAt && sameDay(c.lastRunAt) ? (c.runsToday ?? 0) : 0;
  const force = req.nextUrl.searchParams.get("force") === "1" && ctx.isAdmin;

  // Non-admins can't exceed the cap; if capped, return the cached review.
  if (!force && runsToday >= MAX_RUNS_PER_DAY && c?.narration) {
    return NextResponse.json({ result, narration: c.narration, model: c.model, generatedAt: cached!.generatedAt, cached: true, capped: true });
  }

  const out = await narrate(result);
  const generatedAt = new Date().toISOString();
  if (out.narration) {
    await writeAiCache(ctx, CACHE_KEY, {
      generatedAt,
      data: { narration: out.narration, model: out.model, signature: sig, lastRunAt: generatedAt, runsToday: force ? runsToday : runsToday + 1 },
    }).catch(() => {});
  }
  return NextResponse.json({ result, narration: out.narration, model: out.model, generatedAt, cached: false });
}
