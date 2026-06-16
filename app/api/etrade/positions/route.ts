import { NextResponse } from "next/server";
import { etradeGet } from "@/lib/etrade/client";
import { getSelectedAccountIdKey, getAccounts } from "@/lib/etrade/token-store";

export const dynamic = "force-dynamic";

// Shape returned to the client; the holdings POST route backfills createdAt/etc.
interface SyncedHolding {
  symbol: string;
  shares: number;
  avgCost: number;
  note?: string;
  source: "etrade";
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// GET /api/etrade/positions
// Fetches real portfolio positions for the selected account and maps them
// to the Holding shape used by the local holdings store.
// Read-only — no order endpoints are called.
export async function GET() {
  const accountIdKey = getSelectedAccountIdKey();
  if (!accountIdKey) {
    return NextResponse.json({ error: "No account selected — pick one in the Connectors tab." }, { status: 400 });
  }

  const account = getAccounts().find((a) => a.accountIdKey === accountIdKey);
  const accountLabel = account?.accountName ?? accountIdKey;

  try {
    // view=COMPLETE so cost-basis fields (pricePaid / costPerShare) are returned.
    const data = await etradeGet<any>(
      `/accounts/${accountIdKey}/portfolio.json?count=250&totalsRequired=true&view=COMPLETE`,
    );

    // E*TRADE nesting: PortfolioResponse.AccountPortfolio[].Position[]
    // Either level can come back as a single object instead of an array.
    const accountPortfolios = asArray<any>(data?.PortfolioResponse?.AccountPortfolio);
    const rawPositions: any[] = accountPortfolios.flatMap((ap) => asArray<any>(ap?.Position));

    const holdings: SyncedHolding[] = rawPositions
      .filter((pos: any) => {
        const sec = pos?.Product?.securityType ?? "";
        return sec === "EQ" && pos?.Product?.symbol;
      })
      .map((pos: any) => {
        const shares = Number(pos.quantity ?? 0);
        // Prefer per-share cost; fall back to total cost / shares.
        const complete = pos.Complete ?? pos;
        let avgCost = Number(complete.costPerShare ?? complete.pricePaid ?? 0);
        if (!avgCost && complete.totalCost && shares) {
          avgCost = Number(complete.totalCost) / shares;
        }
        return {
          symbol: String(pos.Product.symbol).toUpperCase(),
          shares,
          avgCost: Number.isFinite(avgCost) ? +avgCost.toFixed(4) : 0,
          note: `Synced from E*TRADE (${accountLabel})`,
          source: "etrade" as const,
        };
      });

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
