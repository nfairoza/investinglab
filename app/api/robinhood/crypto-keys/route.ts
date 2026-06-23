import { NextRequest, NextResponse } from "next/server";
import { getBrokerCtx, writeBrokerConnection, readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// POST /api/robinhood/crypto-keys { apiKey, privateKey }
// Saves the CURRENT user's Robinhood OFFICIAL crypto API credentials into their
// own broker_connections row. These are personal, per-user keys — never shared.
export async function POST(req: NextRequest) {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const apiKey = String(body?.apiKey ?? "").trim();
  const privateKey = String(body?.privateKey ?? "").trim();
  if (!apiKey || !privateKey) {
    return NextResponse.json({ error: "apiKey and privateKey required" }, { status: 400 });
  }
  await writeBrokerConnection(ctx, "robinhood", { crypto: { apiKey, privateKey } });
  return NextResponse.json({ ok: true });
}

// DELETE — remove saved crypto credentials.
export async function DELETE() {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conn = await readBrokerConnection(ctx, "robinhood");
  const { crypto: _drop, ...rest } = conn.data;
  void _drop;
  await writeBrokerConnection(ctx, "robinhood", { ...rest, crypto: null });
  return NextResponse.json({ ok: true });
}
