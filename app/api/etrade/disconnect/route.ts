import { NextResponse } from "next/server";
import { getBrokerCtx, replaceBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST /api/etrade/disconnect
// Clears the CURRENT user's E*TRADE tokens and cached account data.
export async function POST() {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await replaceBrokerConnection(ctx, "etrade", {}, null);
  return NextResponse.json({ ok: true });
}
