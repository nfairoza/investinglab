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
  daysGain?: number;
  daysGainPct?: number;
  totalGain?: number;
  totalGainPct?: number;
  marketValue?: number;
}

// Pull the first finite, non-zero number from a list of candidate values.
function firstNum(...vals: any[]): number | null {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
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
    // view=PERFORMANCE reliably returns pricePaid (avg cost/share) + costBasis.
    const data = await etradeGet<any>(
      `/accounts/${accountIdKey}/portfolio.json?count=250&totalsRequired=true&view=PERFORMANCE`,
    );

    // E*TRADE nesting: PortfolioResponse.AccountPortfolio[].Position[]
    // Either level can come back as a single object instead of an array.
    const accountPortfolios = asArray<any>(data?.PortfolioResponse?.AccountPortfolio);
    const rawPositions: any[] = accountPortfolios.flatMap((ap) => asArray<any>(ap?.Position));

    // Per E*TRADE's documented schema, cost-basis fields live on the BASE
    // Position object (not always in a sub-view): `pricePaid` (avg cost/share),
    // `totalCost` (total), `costPerShare`. We also read E*TRADE's own computed
    // `totalGain`/`totalGainPct` from the base + Performance sub-object so the
    // gain shown matches E*TRADE exactly.
    function avgCostOf(pos: any, shares: number): number {
      const perf = pos.Performance ?? {};
      const perShare = firstNum(pos.pricePaid, pos.costPerShare, perf.pricePaid);
      if (perShare) return perShare;
      const total = firstNum(pos.totalCost, pos.costBasis, perf.totalCost);
      if (total && shares) return total / shares;
      return 0;
    }

    const holdings: SyncedHolding[] = rawPositions
      .filter((pos: any) => {
        const sec = pos?.Product?.securityType ?? "";
        return sec === "EQ" && pos?.Product?.symbol;
      })
      .map((pos: any) => {
        const shares = Number(pos.quantity ?? 0);
        const avgCost = avgCostOf(pos, shares);
        const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
        return {
          symbol: String(pos.Product.symbol).toUpperCase(),
          shares,
          avgCost: Number.isFinite(avgCost) ? +avgCost.toFixed(4) : 0,
          note: `Synced from E*TRADE (${accountLabel})`,
          source: "etrade" as const,
          // E*TRADE's own computed gain numbers — authoritative, shown verbatim.
          daysGain: num(pos.daysGain),
          daysGainPct: num(pos.daysGainPct),
          totalGain: num(pos.totalGain),
          totalGainPct: num(pos.totalGainPct),
          marketValue: num(pos.marketValue),
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
