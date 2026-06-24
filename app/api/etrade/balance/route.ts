import { NextResponse } from "next/server";
import { etradeGet } from "@/lib/etrade/client";
import type { EtradeAccount } from "@/lib/broker-store";
import { getBrokerCtx, readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

function firstNum(...vals: any[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// GET /api/etrade/balance — fetch the selected account's available cash and
// persist it as the app's cash (source: etrade). Read-only on E*TRADE's side.
export async function GET() {
  // Per-user: reads the current user's E*TRADE tokens, writes to their own cash row.
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = await readBrokerConnection(ctx, "etrade");
  const tokens = conn.data.accessToken && conn.data.accessTokenSecret
    ? { token: conn.data.accessToken, secret: conn.data.accessTokenSecret }
    : null;
  if (!tokens) {
    return NextResponse.json({ error: "Not connected — connect E*TRADE first." }, { status: 400 });
  }
  const accountIdKey = conn.data.selectedAccountIdKey;
  if (!accountIdKey) {
    return NextResponse.json({ error: "No account selected — pick one in Connectors." }, { status: 400 });
  }
  const account = ((conn.data.accounts ?? []) as EtradeAccount[]).find((a) => a.accountIdKey === accountIdKey);
  const instType = account?.institutionType || "BROKERAGE";

  try {
    const data = await etradeGet<any>(
      `/accounts/${accountIdKey}/balance.json?instType=${instType}&realTimeNAV=true`,
      tokens,
    );
    const computed = data?.BalanceResponse?.Computed ?? {};
    const rtv = computed?.RealTimeValues ?? {};
    // Prefer cash available to invest/withdraw; fall back to net cash.
    const cash = firstNum(
      computed.cashAvailableForInvestment,
      computed.cashBalance,
      computed.netCash,
      rtv.netMv, // last resort — not ideal, but never undefined
    ) ?? 0;

    const amount = +Number(cash).toFixed(2);
    await ctx.supabase.from("cash").upsert(
      { user_id: ctx.userId, amount, source: "etrade", updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

    return NextResponse.json({ amount, source: "etrade", updatedAt: new Date().toISOString(), accountName: account?.accountName ?? accountIdKey });
  } catch (e: any) {
    const status = e?.status === 401 ? 401 : 500;
    const message = status === 401
      ? "E*TRADE session expired — reconnect in Connectors."
      : (e instanceof Error ? e.message : "Failed to fetch balance");
    return NextResponse.json({ error: message }, { status });
  }
}
