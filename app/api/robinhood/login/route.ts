import { NextRequest, NextResponse } from "next/server";
import { rhLogin, normalizeRhState } from "@/lib/robinhood/stocks";
import { getBrokerCtx, readBrokerConnection, writeBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST { username, password } → starts the unofficial RH stocks login for the
// CURRENT user. Returns { ok } | { mfaRequired } | { challenge } | { workflowId } | { error }.
export async function POST(req: NextRequest) {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || !password) return NextResponse.json({ error: "username and password required" }, { status: 400 });
  try {
    const conn = await readBrokerConnection(ctx, "robinhood");
    const rh = normalizeRhState(conn.data as any);
    const { result, state } = await rhLogin(rh, username, password);
    // Persist the new RH state (device token, pending login, or access token).
    await writeBrokerConnection(ctx, "robinhood", { ...state }, state.connectedAt);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "login failed" }, { status: 500 });
  }
}
