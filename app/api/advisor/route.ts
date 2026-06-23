import { NextResponse } from "next/server";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { marketData } from "@/lib/providers";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { routeText } from "@/lib/ai/router";

export const dynamic = "force-dynamic";

const SYSTEM = `You are Rukmani — the rukMoney AI financial advisor, investment banker, and patient finance teacher. You are given ONE user's complete financial picture (net worth, accounts, holdings, and recent spending by category). Give a concrete, personalized review.
Rules:
- Be specific to THESE numbers — reference the user's actual figures, not generic advice.
- Cover: overall health (net worth, cash runway, debt), portfolio concentration/risk, spending patterns worth attention, and 3-5 prioritized, actionable next steps.
- Teach briefly when you use a term. Be direct and honest — flag real risks (high-interest debt, over-concentration, low emergency fund).
- This is education, NOT individualized financial/investment/tax advice; never guarantee outcomes.
Return ONLY valid JSON (no markdown fences) matching the schema.`;

function buildPrompt(snapshot: string): string {
  return `Here is the user's financial picture:

${snapshot}

Return JSON exactly:
{
  "headline": string,                       // one-sentence overall read
  "healthScore": number,                    // 0-100 overall financial health
  "summary": string,                        // 2-4 sentence plain-English overview
  "strengths": [string],                    // 2-4 concrete positives
  "risks": [ {"title": string, "detail": string, "severity": "low"|"medium"|"high"} ],
  "actions": [ {"title": string, "why": string, "priority": 1} ],   // 3-5, priority 1=highest
  "spendingInsight": string                 // one notable spending observation (or "" if no data)
}`;
}

export async function POST() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ── Gather the user's financial picture (all per-user, RLS-scoped) ──
  // Holdings (live-priced)
  const { data: hRows } = await ctx.supabase.from("holdings").select("symbol, shares, market_value");
  let holdingsValue = 0;
  const holdingLines: string[] = [];
  if (hRows?.length) {
    const symbols = Array.from(new Set(hRows.map((h: any) => String(h.symbol).toUpperCase())));
    const px: Record<string, number> = {};
    await Promise.all(symbols.map(async (s) => { try { const q = await marketData.getQuote(s); if (q.data?.price) px[s] = q.data.price; } catch { /* ignore */ } }));
    for (const h of hRows) {
      const sym = String(h.symbol).toUpperCase();
      const val = px[sym] != null ? px[sym] * Number(h.shares) : (h.market_value != null ? Number(h.market_value) : 0);
      holdingsValue += val;
      holdingLines.push(`  ${sym}: ${h.shares} sh ≈ $${val.toFixed(0)}`);
    }
  }

  // Plaid balances + spending
  let cashTotal = 0, debtTotal = 0;
  const acctLines: string[] = [];
  const spendByCat = new Map<string, number>();
  if (plaidConfigured()) {
    const { data: items } = await ctx.supabase.from("plaid_items").select("institution_name, access_token");
    const plaid = getPlaid();
    for (const it of items ?? []) {
      try {
        const resp = await plaid.accountsBalanceGet({ access_token: it.access_token });
        for (const a of resp.data.accounts ?? []) {
          const v = a.balances?.current ?? 0;
          if (a.type === "credit" || a.type === "loan") { debtTotal += v; acctLines.push(`  ${a.name} (debt): $${v.toFixed(0)}`); }
          else if (a.type === "depository") { cashTotal += a.balances?.available ?? v; acctLines.push(`  ${a.name} (cash): $${v.toFixed(0)}`); }
        }
      } catch { /* skip */ }
    }
    // Recent spending from cache (last 30d, expenses, not transfer/excluded)
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data: txns } = await ctx.supabase
      .from("plaid_transactions")
      .select("amount, plaid_category, date, removed")
      .gte("date", since.toISOString().slice(0, 10));
    for (const t of txns ?? []) {
      if (t.removed) continue;
      const amt = Number(t.amount);
      if (amt > 0) spendByCat.set(t.plaid_category ?? "Other", (spendByCat.get(t.plaid_category ?? "Other") ?? 0) + amt);
    }
  }

  // Manual cash (if any, not double-counting plaid)
  const { data: cashRow } = await ctx.supabase.from("cash").select("amount, source").maybeSingle();
  if (cashRow && cashRow.source !== "plaid") cashTotal += Number(cashRow.amount);

  const assets = cashTotal + holdingsValue;
  const net = assets - debtTotal;
  const spendLines = [...spendByCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, v]) => `  ${c}: $${v.toFixed(0)}`);
  const totalSpend = [...spendByCat.values()].reduce((s, v) => s + v, 0);

  const hasData = assets > 0 || debtTotal > 0 || (hRows?.length ?? 0) > 0;
  if (!hasData) {
    return NextResponse.json({ error: "no_data", message: "Connect a bank or add holdings so Rukmani can review your finances." }, { status: 400 });
  }

  const snapshot = [
    `NET WORTH: $${net.toFixed(0)} (assets $${assets.toFixed(0)}, debts $${debtTotal.toFixed(0)})`,
    `CASH: $${cashTotal.toFixed(0)}`,
    `INVESTMENTS: $${holdingsValue.toFixed(0)}`,
    holdingLines.length ? `HOLDINGS:\n${holdingLines.join("\n")}` : "HOLDINGS: none",
    acctLines.length ? `ACCOUNTS:\n${acctLines.join("\n")}` : "ACCOUNTS: none linked",
    spendLines.length ? `SPENDING last 30d (total $${totalSpend.toFixed(0)}):\n${spendLines.join("\n")}` : "SPENDING: no linked transactions",
  ].join("\n");

  // Cache the briefing per-user for 6h unless forced (cheap re-views).
  const cacheKey = "advisor";
  const cached = await readAiCache(ctx, cacheKey);
  const sixHours = 6 * 60 * 60 * 1000;
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < sixHours) {
    return NextResponse.json({ ...(cached.data as object), cached: true, generatedAt: cached.generatedAt });
  }

  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "Add a Claude or Gemini API key in Connectors to use the advisor." }, { status: 400 });
  }

  try {
    const { text, model } = await routeText({ task: "deep-analysis", system: SYSTEM, user: buildPrompt(snapshot), maxTokens: 2048 });
    const cleaned = text.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
    const review = JSON.parse(start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned);
    const payload = { review, model, netWorth: +net.toFixed(0) };
    const generatedAt = new Date().toISOString();
    await writeAiCache(ctx, cacheKey, { generatedAt, data: payload });
    return NextResponse.json({ ...payload, cached: false, generatedAt });
  } catch (e) {
    return NextResponse.json({ error: "generation_failed", message: e instanceof Error ? e.message : "Advisor failed" }, { status: 500 });
  }
}
