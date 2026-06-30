import { NextRequest, NextResponse } from "next/server";
import { now } from "@/lib/db";
import { getUserClient, readAiCache, writeAiCache } from "@/lib/supabase-data";
import { getUnifiedHoldings, plaidInvestmentCash } from "@/lib/holdings-server";
import { computeNetWorth } from "@/lib/networth";
import { congressData } from "@/lib/providers";
import { routeText } from "@/lib/ai/router";
import { resolveApiKey } from "@/lib/ai/anthropic";
import { geminiKey } from "@/lib/ai/gemini";
import { parseLooseJson } from "@/lib/ai/json";
import { logError } from "@/lib/error-log";

export const dynamic = "force-dynamic";

// Two cache slots so Market and Market+Congress scans don't clobber each other.
const CACHE_KEY = "opportunities";
const CACHE_KEY_CONGRESS = "opportunities_congress";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — auto-run-on-open reuses a recent scan

// A small curated large-cap universe to scan for NEW ideas (mirrors the Stock
// Map universe). The AI may also surface other tickers via web research.
const CURATED = [
  "AAPL","MSFT","NVDA","AVGO","AMD","GOOGL","META","AMZN","TSLA","NFLX",
  "LLY","UNH","JPM","V","MA","COST","WMT","XOM","CVX","CAT","GE","PLTR",
  "MU","NOW","CRM","ORCL","ISRG","BKNG","ANET","VRT",
];

const SYSTEM = `You are a sharp, skeptical portfolio strategist helping a retail investor deploy CASH.
Rules:
- The available cash is a REAL figure derived from the user's linked accounts (bank + brokerage). Treat it as a hard budget. Do NOT invent, assume, or round up a different cash amount. Buys/adds must sum to <= the available cash provided.
- If you believe more should be deployed than the cash on hand allows, you may propose TRIM/SELL ideas to RAISE cash first, and then BUY ideas funded by those proceeds — but state clearly that those buys depend on selling, and never assume cash that isn't there.
- SEARCH THE WEB for current prices, recent news, earnings, and catalysts.
- Cover three lanes: (1) best uses among what they ALREADY hold/watch, (2) NEW opportunities from the broad market worth deploying cash into, (3) anything to TRIM/SELL to raise quality, cut risk, or fund higher-conviction buys.
- Each idea: ticker, action, dollarAmount, a one-line thesis, the key risk, a confidence 0-100, and a timeHorizon.
- Be honest about uncertainty. Separate "good company" from "good entry price today". No fake precision.
- This is educational analysis, NOT financial advice, and you must not place trades.
Return ONLY valid JSON (no markdown) matching the schema given.`;

function buildPrompt(cashLines: string, holdings: any[], watchlist: string[], congressBlock: string): string {
  const hold = holdings.map((h) => `${h.symbol} (${h.shares} sh @ $${h.avgCost})`).join(", ") || "none";
  return `${cashLines}

Current holdings: ${hold}.
Watchlist: ${watchlist.join(", ") || "none"}.
Curated large-cap universe to also consider for new ideas: ${CURATED.join(", ")}.
${congressBlock}
Search the web for the latest prices, news, earnings, and market backdrop, then produce a ranked plan.

Return JSON with this exact shape:
{
  "marketSummary": string,                 // 2-3 sentences on the current market backdrop / what's happening now
  "ideas": [
    {
      "ticker": string,
      "action": "Buy" | "Add" | "Trim" | "Sell",
      "dollarAmount": number,              // suggested $ to allocate (0 for sells where you'd exit fully — put proceeds idea in thesis)
      "lane": "owned" | "new" | "reduce",  // owned=already hold/watch, new=fresh idea, reduce=trim/sell
      "thesis": string,                    // one line why
      "amountReason": string,              // WHY this dollar size — tie to conviction, cash %, diversification, position sizing
      "signalSource": "market" | "congress" | "both",  // what primarily drove this pick
      "risk": string,                      // the key risk
      "confidence": number,                // 0-100
      "timeHorizon": string                // e.g. "1-3 months", "6-12 months"
    }
  ],
  "notes": string                          // caveats, e.g. cash left undeployed and why
}
Provide 4-8 ideas total, spanning the three lanes. Keep total buy/add dollarAmount <= the available cash.
For amountReason, be concrete: explain the sizing (e.g. "~15% of cash — high conviction but already concentrated in tech, so capped"). For signalSource, use "congress" or "both" ONLY when recent congressional trading actually informed the pick.`;
}

// Recent congressional trading, aggregated into a net buy/sell signal per ticker,
// so the AI can weigh "smart money in DC" alongside the market scan. Best-effort:
// returns "" if the congress provider is unavailable.
async function buildCongressBlock(): Promise<string> {
  try {
    const res = await congressData.getRecent(120);
    const rows: any[] = (res as any)?.data ?? [];
    if (!rows.length) return "";
    const agg = new Map<string, { buys: number; sells: number; members: Set<string> }>();
    for (const r of rows) {
      const sym = String(r.ticker ?? r.symbol ?? "").toUpperCase();
      if (!sym || sym.length > 5) continue;
      const a = agg.get(sym) ?? { buys: 0, sells: 0, members: new Set<string>() };
      const action = String(r.type ?? r.transaction ?? r.action ?? "").toLowerCase();
      if (action.includes("buy") || action.includes("purchase")) a.buys++;
      else if (action.includes("sell") || action.includes("sale")) a.sells++;
      if (r.member ?? r.representative) a.members.add(String(r.member ?? r.representative));
      agg.set(sym, a);
    }
    const ranked = [...agg.entries()]
      .map(([sym, a]) => ({ sym, net: a.buys - a.sells, buys: a.buys, sells: a.sells, members: a.members.size }))
      .filter((x) => x.buys + x.sells >= 1)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || (b.buys + b.sells) - (a.buys + a.sells))
      .slice(0, 15);
    if (!ranked.length) return "";
    const lines = ranked.map((x) => `  ${x.sym}: ${x.buys} buys / ${x.sells} sells across ${x.members} member${x.members !== 1 ? "s" : ""} (net ${x.net > 0 ? "+" : ""}${x.net})`).join("\n");
    return `\nRECENT CONGRESSIONAL TRADING (disclosed, lagged — a sentiment signal, NOT a recommendation):\n${lines}\nFactor this in: net-buying by multiple members can corroborate an idea; heavy selling is a caution flag. Disclosures lag by weeks and are ranges — weight accordingly, don't follow blindly.\n`;
  } catch {
    return "";
  }
}

async function generate(cashInfo: { total: number; bank: number; investment: number }, holdings: any[], watchlist: string[], useCongress: boolean) {
  const congressBlock = useCongress ? await buildCongressBlock() : "";
  const cashLines = `Available cash to deploy: $${cashInfo.total.toLocaleString()} total. This is REAL — do not assume any other amount.
  Breakdown: $${cashInfo.bank.toLocaleString()} bank/depository cash + $${cashInfo.investment.toLocaleString()} uninvested brokerage cash.
  To deploy more than this, you must first TRIM/SELL holdings to raise cash, and say so.`;
  const { text, provider, model } = await routeText({
    task: "deep-analysis",
    system: SYSTEM,
    user: buildPrompt(cashLines, holdings, watchlist, congressBlock),
    maxTokens: 4096,
    webSearch: true,
  });
  const parsed = parseLooseJson(text);
  return {
    ...parsed,
    cash: cashInfo.total,
    cashBank: cashInfo.bank,
    cashInvestment: cashInfo.investment,
    mode: useCongress ? "congress" : "market",
    congressUsed: Boolean(congressBlock),
    aiName: provider === "claude" ? "Claude" : "Gemini",
    model,
    generatedAt: now(),
  };
}

// GET — return cached scan if fresh (within TTL), else null + meta so the client
// can decide whether to trigger a fresh run. ?force=1 ignores the cache.
export async function GET(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const useCongress = req.nextUrl.searchParams.get("congress") === "1";
  const key = useCongress ? CACHE_KEY_CONGRESS : CACHE_KEY;
  const cached = await readAiCache(ctx, key);
  if (!force && cached && Date.now() - new Date(cached.generatedAt).getTime() < TTL_MS) {
    return NextResponse.json({ cached: true, ...(cached.data as object) });
  }
  return NextResponse.json({ cached: false, stale: Boolean(cached), data: cached?.data ?? null });
}

// POST — run a fresh scan, cache it, return it. ?congress=1 folds in
// congressional trading signal.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!resolveApiKey() && !geminiKey()) {
    return NextResponse.json({ error: "no_key", message: "Add a Claude or Gemini API key in Connectors to use AI opportunities." }, { status: 400 });
  }
  const useCongress = req.nextUrl.searchParams.get("congress") === "1";
  const [nw, unified, invCash, { data: wl }, { data: cashRow }] = await Promise.all([
    computeNetWorth(ctx).catch(() => null),
    getUnifiedHoldings(ctx.supabase, { realTickersOnly: true }),
    plaidInvestmentCash(ctx.supabase),
    ctx.supabase.from("watch_list_items").select("symbol"),
    ctx.supabase.from("cash").select("amount").maybeSingle(),
  ]);
  // Real deployable cash, no guessing:
  //   bank/depository cash  = Plaid-linked checking/savings balances (net worth).
  //   investment cash       = uninvested brokerage sweep ("US Dollar" holding).
  // If no bank is linked yet, fall back to the manually-entered cash figure so a
  // user who hasn't connected a bank still gets a sensible (and labeled) number.
  const bankCash = nw
    ? nw.items.filter((i) => i.kind === "asset" && i.type === "cash").reduce((s, i) => s + i.amount, 0)
    : 0;
  const bank = bankCash > 0 ? bankCash : Number(cashRow?.amount ?? 0);
  const investment = invCash;
  const cashInfo = { total: bank + investment, bank, investment };
  const holdingList = unified.map((h) => ({ symbol: h.symbol, shares: h.shares, avgCost: h.avgCost }));
  const watchlist = (wl ?? []).map((w: any) => w.symbol);

  try {
    const result = await generate(cashInfo, holdingList, watchlist, useCongress);
    await writeAiCache(ctx, useCongress ? CACHE_KEY_CONGRESS : CACHE_KEY, { generatedAt: result.generatedAt, data: result });
    return NextResponse.json({ cached: false, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    await logError({ message: msg, category: "ai", section: "opportunities", statusCode: 500, path: "/api/opportunities", userId: ctx.userId });
    return NextResponse.json(
      { error: "generation_failed", message: msg },
      { status: 500 },
    );
  }
}
