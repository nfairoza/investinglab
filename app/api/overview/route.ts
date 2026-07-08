import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getUserClient, isAdminUser } from "@/lib/supabase-data";
import { computeNetWorth } from "@/lib/networth";
import { computeAdvisor } from "@/lib/advisor/engine";
import { getUnifiedHoldings } from "@/lib/holdings-server";
import { marketData, type DataResult, type Quote } from "@/lib/providers";
import { plaidConfigured, selectPlaidItems, resolvePlaidToken, getPlaid } from "@/lib/plaid";
import { readSnapshots, writeSnapshot } from "@/lib/plaid-snapshot";
import { categorize } from "@/lib/money/categorize";
import { isDemoRequest } from "@/lib/demo/session";
import { DEMO_USER } from "@/lib/demo/fixtures";
import type { AccountBase } from "plaid";

export const dynamic = "force-dynamic";

// GET /api/overview (PA-A2) — ONE auth check + ONE round trip that assembles
// everything the Overview page needs, server-side in parallel, instead of the 6
// separate client calls it used to fire (networth, accounts, transactions,
// holdings, advisor, me). The individual endpoints stay alive for other pages.
export async function GET() {
  const t0 = Date.now();
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Identity (from the same verified session; demo has no real auth user).
  const demo = isDemoRequest();
  const user = demo
    ? { user_metadata: { full_name: DEMO_USER.fullName } as Record<string, unknown>, email: DEMO_USER.email, app_metadata: {} as Record<string, unknown> }
    : (await createClient().auth.getUser()).data.user;

  // Per-branch timing (returned to admins so "why is it slow" is data, not guesswork).
  const timings: Record<string, number> = {};
  const timed = async <T>(label: string, p: Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try { return await p; } finally { timings[label] = Date.now() - t0; }
  };

  // Phase 1 — net worth + the branches that don't depend on it, in parallel.
  // Net worth is computed ONCE here and handed to the advisor in phase 2, so the
  // advisor branch doesn't re-run the whole net-worth engine (PA-A1: avoids
  // duplicate work + duplicate Plaid resolution on the Overview).
  const [nw, holdingsRaw, accounts, txns] = await Promise.all([
    timed("netWorth", computeNetWorth(ctx).catch(() => null)),
    timed("holdings", getUnifiedHoldings(ctx.supabase, { userId: ctx.userId }).catch(() => [])),
    timed("accounts", plaidAccounts(ctx).catch(() => ({ items: [], totalCash: 0, stale: false, asOf: null }))),
    timed("transactions", recentTransactions(ctx).catch(() => [])),
  ]);

  // Phase 2 — advisor (reuses the computed net worth) + live quotes, in parallel.
  const symbols = Array.from(new Set(holdingsRaw.filter((h) => h.hasRealTicker).map((h) => h.symbol)));
  const [advisor, quotes] = await Promise.all([
    timed("advisor", computeAdvisor(ctx, { netWorth: nw ?? undefined }).catch(() => null)),
    symbols.length
      ? timed("quotes", marketData.getQuotes(symbols).catch(() => ({} as Record<string, DataResult<Quote>>)))
      : Promise.resolve({} as Record<string, DataResult<Quote>>),
  ]);
  const holdings = holdingsRaw.map((h) => {
    const q = quotes[h.symbol.toUpperCase()]?.data ?? null;
    const price = q?.price ?? h.value ?? null;
    const marketValue = (h as any).value ?? (price != null ? price * h.shares : null);
    return {
      symbol: h.symbol, shares: h.shares, marketValue,
      daysGainPct: q?.changePct ?? null,
      daysGain: q?.changePct != null && marketValue != null ? (q.changePct / 100) * marketValue : null,
    };
  });

  const isAdmin = isAdminUser(user);
  timings.total = Date.now() - t0;

  return NextResponse.json({
    me: {
      fullName: (user?.user_metadata?.full_name as string) ?? (user?.user_metadata?.name as string) ?? null,
      email: user?.email ?? null,
      isAdmin,
    },
    netWorth: nw,
    advisor: advisor ? { result: advisor } : null,
    accounts,
    holdings,
    transactions: txns,
    // Admin-only timing breakdown (ms per branch) so slowness is readable data.
    ...(isAdmin ? { timings } : {}),
  });
}

// Snapshot-first account balances (mirrors /api/plaid/accounts, PA-A1) so the
// Overview cash/accounts cards never block on a live Plaid call.
async function plaidAccounts(ctx: { supabase: any; userId: string }) {
  if (!plaidConfigured()) return { items: [], totalCash: 0, stale: false, asOf: null };
  const { rows: items } = await selectPlaidItems(ctx.supabase, "item_id, institution_name");
  if (!items?.length) return { items: [], totalCash: 0, stale: false, asOf: null };

  const snaps = await readSnapshots<AccountBase[]>(ctx.supabase, "balances");
  const snapById = new Map(snaps.map((s) => [s.itemId, s]));
  const plaid = getPlaid();
  const needLive = items.filter((it) => !snapById.has(it.item_id));
  const live = await Promise.allSettled(needLive.map((it) => {
    const token = resolvePlaidToken(it as any);
    if (!token) return Promise.reject(new Error("no token"));
    return plaid.accountsBalanceGet({ access_token: token });
  }));
  const liveById = new Map<string, AccountBase[]>();
  for (let i = 0; i < needLive.length; i++) {
    const r = live[i];
    if (r.status === "fulfilled") {
      const accts = r.value.data.accounts ?? [];
      liveById.set(needLive[i].item_id, accts);
      void writeSnapshot(ctx.supabase, ctx.userId, needLive[i].item_id, "balances", accts);
    }
  }

  let totalCash = 0;
  let anyStale = false;
  const out = items.map((it) => {
    const accts = liveById.get(it.item_id) ?? snapById.get(it.item_id)?.payload ?? null;
    if (snapById.get(it.item_id)?.stale) anyStale = true;
    const accounts = (accts ?? []).map((a) => {
      const bal = a.balances?.current ?? 0;
      if (a.type === "depository") totalCash += a.balances?.available ?? bal ?? 0;
      return { account_id: a.account_id, type: a.type, current: a.balances?.current ?? null };
    });
    return { itemId: it.item_id, institution: it.institution_name, accounts };
  });
  const oldest = snaps.length ? snaps.reduce((m, s) => Math.min(m, new Date(s.fetchedAt).getTime()), Date.now()) : null;
  return { items: out, totalCash: +totalCash.toFixed(2), stale: anyStale, asOf: oldest ? new Date(oldest).toISOString() : null };
}

// Recent categorized transactions (read cache; no live Plaid sync here — the
// Overview only needs the cached rows for its month figures).
async function recentTransactions(ctx: { supabase: any }) {
  const { data } = await ctx.supabase
    .from("plaid_transactions")
    .select("date, amount, plaid_category, plaid_detailed, merchant, name, account_id")
    .eq("removed", false)
    .order("date", { ascending: false })
    .limit(500);
  interface Row { date: string; amount: number | string; plaid_category: string | null; plaid_detailed: string | null; merchant: string | null; name: string; account_id: string }
  return (data ?? []).map((t: Row) => ({
    date: t.date,
    amount: Number(t.amount),
    category: categorize({ merchant: t.merchant, name: t.name, plaidDetailed: t.plaid_detailed, plaidPrimary: t.plaid_category }),
    isTransfer: false,
    excluded: false,
    accountId: t.account_id,
  }));
}
