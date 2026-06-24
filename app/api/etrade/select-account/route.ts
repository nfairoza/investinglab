import { NextRequest, NextResponse } from "next/server";
import type { EtradeAccount } from "@/lib/broker-store";
import { getBrokerCtx, readBrokerConnection, writeBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST /api/etrade/select-account { accountIdKey }
// Saves which of the CURRENT user's accounts to sync positions from.
export async function POST(req: NextRequest) {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const accountIdKey = typeof body?.accountIdKey === "string" ? body.accountIdKey : null;

  if (!accountIdKey) {
    return NextResponse.json({ error: "accountIdKey required" }, { status: 400 });
  }

  const conn = await readBrokerConnection(ctx, "etrade");
  const accounts = (conn.data.accounts ?? []) as EtradeAccount[];
  const found = accounts.find((a) => a.accountIdKey === accountIdKey);
  if (!found) {
    return NextResponse.json({ error: "Unknown accountIdKey" }, { status: 400 });
  }

  await writeBrokerConnection(ctx, "etrade", { selectedAccountIdKey: accountIdKey });
  return NextResponse.json({ ok: true, selectedAccountIdKey: accountIdKey });
}
