import { NextResponse } from "next/server";
import { normalizeRhState } from "@/lib/robinhood/stocks";
import { getBrokerCtx, readBrokerConnection, writeBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST /api/robinhood/disconnect — clears the CURRENT user's RH stocks login
// (keeps the device token, which RH trusts, and any saved crypto credentials).
export async function POST() {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = await readBrokerConnection(ctx, "robinhood");
  const rh = normalizeRhState(conn.data as any);
  await writeBrokerConnection(
    ctx,
    "robinhood",
    { deviceToken: rh.deviceToken, accessToken: null, refreshToken: null, pending: null, challengeId: null },
    null,
  );
  return NextResponse.json({ ok: true });
}
