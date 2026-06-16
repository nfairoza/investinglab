import { NextResponse } from "next/server";
import { etradeGet } from "@/lib/etrade/client";
import { getSelectedAccountIdKey, getAccounts } from "@/lib/etrade/token-store";
import type { Holding } from "@/lib/local-store";

export const dynamic = "force-dynamic";

// GET /api/etrade/positions
// Fetches real portfolio positions for the selected account and maps them
// to the Holding shape used by the local holdings store.
// Read-only — no order endpoints are called.
export async function GET() {
  const accountIdKey = getSelectedAccountIdKey();
  if (!accountIdKey) {
    return NextResponse.json({ error: "No account selected — pick one in the Connectors tab." }, { status: 400 });
  }

  const accounts = getAccounts();
  const account = accounts.find((a) => a.accountIdKey === accountIdKey);
  const accountLabel = account?.accountName ?? accountIdKey;

  try {
    // Paginate: fetch up to 250 positions (count=250 is the max E*TRADE supports)
    const data = await etradeGet<any>(
      `/accounts/${accountIdKey}/portfolio.json?count=250&totalsRequired=true&view=QUICK`,
    );

    const portfolios: any[] = data?.PortfolioResponse?.Portfolio ?? [];
    const rawPositions: any[] = portfolios.flatMap((p: any) => {
      const pos = p?.Position ?? [];
      return Array.isArray(pos) ? pos : [pos];
    });

    // Map to Holding shape — only equity positions with a symbol
    const holdings: Holding[] = rawPositions
      .filter((pos: any) => {
        const sec = pos?.Product?.securityType ?? "";
        return sec === "EQ" && pos?.Product?.symbol;
      })
      .map((pos: any) => ({
        id: `etrade-${accountIdKey}-${pos.Product.symbol}`,
        symbol: String(pos.Product.symbol).toUpperCase(),
        shares: Number(pos.quantity ?? 0),
        avgCost: Number(pos.costPerShare ?? pos.pricePaid ?? 0),
        note: `Synced from E*TRADE (${accountLabel})`,
      }));

    return NextResponse.json({
      holdings,
      accountName: accountLabel,
      syncedAt: new Date().toISOString(),
      totalPositions: rawPositions.length,
      equityPositions: holdings.length,
    });
  } catch (e: any) {
    const status = e?.status === 401 ? 401 : 500;
    const message =
      status === 401
        ? "E*TRADE session expired — click Reconnect to log in again."
        : (e instanceof Error ? e.message : "Failed to fetch positions");
    return NextResponse.json({ error: message }, { status });
  }
}
