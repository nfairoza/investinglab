import { NextResponse } from "next/server";
import {
  isConnected,
  getAccounts,
  getSelectedAccountIdKey,
  getConnectedAt,
} from "@/lib/etrade/token-store";
import { hasConsumerKey } from "@/lib/etrade/client";
import { getConnectorValue } from "@/lib/connectors/runtime";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// GET /api/etrade/status
// Returns connection status, account list (names only, no tokens),
// and the currently selected account key.
export async function GET() {
  // Admin-only while broker tokens are shared. Non-admins get a "not connected"
  // shape so their UI simply shows no E*TRADE, never the admin's.
  if (!(await getAdminClient())) {
    return NextResponse.json({ hasCredentials: false, connected: false, connectedAt: null, accounts: [], selectedAccountIdKey: null, sandbox: false });
  }
  const sbVal = getConnectorValue("ETRADE_SANDBOX") ?? process.env.ETRADE_SANDBOX;
  const sandbox = sbVal === "true" || sbVal === "1";
  return NextResponse.json({
    hasCredentials: hasConsumerKey(),
    connected: isConnected(),
    connectedAt: getConnectedAt(),
    accounts: getAccounts(),
    selectedAccountIdKey: getSelectedAccountIdKey(),
    sandbox,
  });
}
