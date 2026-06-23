import { NextResponse } from "next/server";
import { hasConsumerKey } from "@/lib/etrade/client";
import { getConnectorValue } from "@/lib/connectors/runtime";
import { getBrokerCtx, readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// GET /api/etrade/status
// Returns the CURRENT user's connection status, account list (names only, no
// tokens), and the currently selected account key. Each user sees only their own.
export async function GET() {
  const ctx = await getBrokerCtx();
  if (!ctx) {
    return NextResponse.json({ hasCredentials: false, connected: false, connectedAt: null, accounts: [], selectedAccountIdKey: null, sandbox: false });
  }
  const conn = await readBrokerConnection(ctx, "etrade");
  const sbVal = getConnectorValue("ETRADE_SANDBOX") ?? process.env.ETRADE_SANDBOX;
  const sandbox = sbVal === "true" || sbVal === "1";
  return NextResponse.json({
    hasCredentials: hasConsumerKey(),
    connected: Boolean(conn.data.accessToken && conn.data.accessTokenSecret),
    connectedAt: conn.connectedAt,
    accounts: conn.data.accounts ?? [],
    selectedAccountIdKey: conn.data.selectedAccountIdKey ?? null,
    sandbox,
  });
}
