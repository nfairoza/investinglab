import { NextResponse } from "next/server";
import { etradeGet } from "@/lib/etrade/client";
import { getSelectedAccountIdKey, getAccounts } from "@/lib/etrade/token-store";
import { getUserClient } from "@/lib/supabase-data";

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
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accountIdKey = getSelectedAccountIdKey();
  if (!accountIdKey) {
    return NextResponse.json({ error: "No account selected — pick one in Connectors." }, { status: 400 });
  }
  const account = getAccounts().find((a) => a.accountIdKey === accountIdKey);
  const instType = account?.institutionType || "BROKERAGE";

  try {
    const data = await etradeGet<any>(
      `/accounts/${accountIdKey}/balance.json?instType=${instType}&realTimeNAV=true`,
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
