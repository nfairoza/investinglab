import { NextRequest, NextResponse } from "next/server";
import { rhSubmitMfa, normalizeRhState } from "@/lib/robinhood/stocks";
import { getBrokerCtx, readBrokerConnection, writeBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST { code } → submit the MFA/SMS/authenticator code to finish RH login for
// the CURRENT user.
export async function POST(req: NextRequest) {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const conn = await readBrokerConnection(ctx, "robinhood");
  const rh = normalizeRhState(conn.data as any);
  const { result, state } = await rhSubmitMfa(rh, code);
  await writeBrokerConnection(ctx, "robinhood", { ...state }, state.connectedAt);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
