import { NextRequest, NextResponse } from "next/server";
import { fetchAccessToken, etradeGet } from "@/lib/etrade/client";
import type { EtradeAccount } from "@/lib/etrade/token-store";
import { getBrokerCtx, readBrokerConnection, writeBrokerConnection, replaceBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST /api/etrade/verify  { code }
// E*TRADE's out-of-band flow: after the user authorizes on E*TRADE's site, it
// shows a short verification code. The user pastes it here; we exchange it (with
// the stored request token) for an access token, then fetch the account list.
// All tokens are stored in the CURRENT user's broker_connections row.
export async function POST(req: NextRequest) {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Verification code required." }, { status: 400 });

  const conn = await readBrokerConnection(ctx, "etrade");
  const reqToken = conn.data.requestToken;
  const reqSecret = conn.data.requestTokenSecret;
  if (!reqToken || !reqSecret) {
    return NextResponse.json(
      { error: "No pending connection — click Connect to E*TRADE first." },
      { status: 400 },
    );
  }

  try {
    const { token, secret } = await fetchAccessToken(reqToken, reqSecret, code);

    // Fetch and cache the account list using the freshly minted access token.
    const data = await etradeGet<any>("/accounts/list.json", { token, secret });
    const raw = data?.AccountListResponse?.Accounts?.Account ?? [];
    const accounts: EtradeAccount[] = (Array.isArray(raw) ? raw : [raw]).map((a: any) => ({
      accountId: String(a.accountId ?? ""),
      accountIdKey: String(a.accountIdKey ?? ""),
      accountName: String(a.accountDesc ?? a.accountName ?? a.accountId ?? ""),
      accountType: String(a.accountType ?? ""),
      institutionType: String(a.institutionType ?? ""),
    }));

    await writeBrokerConnection(
      ctx,
      "etrade",
      {
        accessToken: token,
        accessTokenSecret: secret,
        accounts,
        requestToken: null,
        requestTokenSecret: null,
      },
      new Date().toISOString(),
    );

    return NextResponse.json({ ok: true, accounts });
  } catch (e) {
    // Wipe any partial token state so the user can cleanly retry.
    await replaceBrokerConnection(ctx, "etrade", {}, null).catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed — the code may be wrong or expired." },
      { status: 400 },
    );
  }
}
