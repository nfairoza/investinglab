import { NextRequest, NextResponse } from "next/server";
import { setSelectedAccount, getAccounts } from "@/lib/etrade/token-store";

export const dynamic = "force-dynamic";

// POST /api/etrade/select-account { accountIdKey }
// Saves which account to sync positions from.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accountIdKey = typeof body?.accountIdKey === "string" ? body.accountIdKey : null;

  if (!accountIdKey) {
    return NextResponse.json({ error: "accountIdKey required" }, { status: 400 });
  }

  const accounts = getAccounts();
  const found = accounts.find((a) => a.accountIdKey === accountIdKey);
  if (!found) {
    return NextResponse.json({ error: "Unknown accountIdKey" }, { status: 400 });
  }

  setSelectedAccount(accountIdKey);
  return NextResponse.json({ ok: true, selectedAccountIdKey: accountIdKey });
}
