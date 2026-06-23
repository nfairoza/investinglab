import { NextRequest, NextResponse } from "next/server";
import { fetchAccessToken, etradeGet } from "@/lib/etrade/client";
import { getRequestToken, setAccessTokens, setAccounts, clearAll, type EtradeAccount } from "@/lib/etrade/token-store";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/etrade/verify  { code }
// E*TRADE's out-of-band flow: after the user authorizes on E*TRADE's site, it
// shows a short verification code. The user pastes it here; we exchange it (with
// the stored request token) for an access token, then fetch the account list.
export async function POST(req: NextRequest) {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Verification code required." }, { status: 400 });

  const stored = getRequestToken();
  if (!stored) {
    return NextResponse.json(
      { error: "No pending connection — click Connect to E*TRADE first." },
      { status: 400 },
    );
  }

  try {
    const { token, secret } = await fetchAccessToken(stored.token, stored.secret, code);
    setAccessTokens(token, secret);

    // Fetch and cache the account list.
    const data = await etradeGet<any>("/accounts/list.json");
    const raw = data?.AccountListResponse?.Accounts?.Account ?? [];
    const accounts: EtradeAccount[] = (Array.isArray(raw) ? raw : [raw]).map((a: any) => ({
      accountId: String(a.accountId ?? ""),
      accountIdKey: String(a.accountIdKey ?? ""),
      accountName: String(a.accountDesc ?? a.accountName ?? a.accountId ?? ""),
      accountType: String(a.accountType ?? ""),
      institutionType: String(a.institutionType ?? ""),
    }));
    setAccounts(accounts);

    return NextResponse.json({ ok: true, accounts });
  } catch (e) {
    clearAll();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed — the code may be wrong or expired." },
      { status: 400 },
    );
  }
}
