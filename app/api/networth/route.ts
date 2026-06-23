import { NextResponse } from "next/server";
import { getUserClient } from "@/lib/supabase-data";
import { getPlaid, plaidConfigured } from "@/lib/plaid";
import { marketData } from "@/lib/providers";

export const dynamic = "force-dynamic";

// GET /api/networth — unified net worth across every connected source:
//   • Plaid bank/credit/loan balances (assets vs debts)
//   • Plaid investment holdings (value)
//   • manual + E*TRADE holdings (live-priced)
//   • manual cash row
// Persists a daily snapshot and returns the recent trend.
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const breakdown: { label: string; kind: "asset" | "debt"; amount: number; source: string }[] = [];
  let plaidInvestmentValue = 0;

  // ── Plaid balances (depository = cash asset, credit/loan = debt) ──
  if (plaidConfigured()) {
    const { data: items } = await ctx.supabase.from("plaid_items").select("institution_name, access_token");
    const plaid = getPlaid();
    for (const it of items ?? []) {
      try {
        const resp = await plaid.accountsBalanceGet({ access_token: it.access_token });
        for (const a of resp.data.accounts ?? []) {
          const v = a.balances?.current ?? 0;
          if (!v) continue;
          if (a.type === "credit" || a.type === "loan") {
            breakdown.push({ label: `${it.institution_name ?? "Bank"} · ${a.name}`, kind: "debt", amount: v, source: "plaid" });
          } else if (a.type === "depository") {
            breakdown.push({ label: `${it.institution_name ?? "Bank"} · ${a.name}`, kind: "asset", amount: v, source: "plaid" });
          }
          // investment-type balances are captured via holdings below
        }
      } catch { /* skip */ }
    }
    // Plaid investment holdings value
    const { data: items2 } = await ctx.supabase.from("plaid_items").select("institution_name, access_token");
    for (const it of items2 ?? []) {
      try {
        const resp = await plaid.investmentsHoldingsGet({ access_token: it.access_token });
        let v = 0;
        for (const h of resp.data.holdings ?? []) v += h.institution_value ?? 0;
        if (v) { plaidInvestmentValue += v; breakdown.push({ label: `${it.institution_name ?? "Brokerage"} · investments`, kind: "asset", amount: v, source: "plaid" }); }
      } catch { /* skip */ }
    }
  }

  // ── Manual + E*TRADE holdings (live-priced) ──
  const { data: hRows } = await ctx.supabase.from("holdings").select("symbol, shares, market_value");
  let holdingsValue = 0;
  if (hRows?.length) {
    const symbols = Array.from(new Set(hRows.map((h: any) => String(h.symbol).toUpperCase())));
    const quotes: Record<string, number> = {};
    await Promise.all(symbols.map(async (s) => {
      try { const q = await marketData.getQuote(s); if (q.data?.price) quotes[s] = q.data.price; } catch { /* ignore */ }
    }));
    for (const h of hRows) {
      const sym = String(h.symbol).toUpperCase();
      const px = quotes[sym];
      const val = px != null ? px * Number(h.shares) : (h.market_value != null ? Number(h.market_value) : 0);
      holdingsValue += val;
    }
    if (holdingsValue) breakdown.push({ label: "Stock holdings (manual / E*TRADE)", kind: "asset", amount: holdingsValue, source: "holdings" });
  }

  // ── Manual cash row (only if not already covered by Plaid depository) ──
  const { data: cashRow } = await ctx.supabase.from("cash").select("amount, source").maybeSingle();
  const manualCash = cashRow && cashRow.source !== "plaid" ? Number(cashRow.amount) : 0;
  if (manualCash) breakdown.push({ label: "Cash (manual)", kind: "asset", amount: manualCash, source: "cash" });

  const assets = breakdown.filter((b) => b.kind === "asset").reduce((s, b) => s + b.amount, 0);
  const debts = breakdown.filter((b) => b.kind === "debt").reduce((s, b) => s + b.amount, 0);
  const net = assets - debts;

  // ── Persist today's snapshot, then read the trend ──
  try {
    await ctx.supabase.from("networth_snapshots").upsert(
      { user_id: ctx.userId, assets: +assets.toFixed(2), debts: +debts.toFixed(2), net: +net.toFixed(2) },
      { onConflict: "user_id,as_of" },
    );
  } catch { /* snapshot is best-effort */ }

  const { data: trend } = await ctx.supabase
    .from("networth_snapshots")
    .select("as_of, net, assets, debts")
    .order("as_of", { ascending: true })
    .limit(180);

  return NextResponse.json({
    assets: +assets.toFixed(2),
    debts: +debts.toFixed(2),
    net: +net.toFixed(2),
    breakdown: breakdown.sort((a, b) => b.amount - a.amount),
    trend: (trend ?? []).map((t: any) => ({ date: t.as_of, net: Number(t.net), assets: Number(t.assets), debts: Number(t.debts) })),
  });
}
