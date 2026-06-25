import { NextResponse } from "next/server";
import { getBrokerCtx, replaceBrokerConnection } from "@/lib/broker-store";
import { getUserClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/etrade/disconnect
// Clears the CURRENT user's E*TRADE tokens AND purges all data synced from it
// (holdings + E*TRADE-sourced cash). For security and freshness: once
// disconnected, nothing pulled from E*TRADE should linger.
export async function POST() {
  const ctx = await getBrokerCtx();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await replaceBrokerConnection(ctx, "etrade", {}, null);

  // Purge synced data (E*TRADE holdings are stored with source="etrade"; cash
  // carries source="etrade" when it came from the broker balance sync).
  const userCtx = await getUserClient();
  if (userCtx) {
    await userCtx.supabase.from("holdings").delete().eq("source", "etrade");
    await userCtx.supabase.from("cash").delete().eq("source", "etrade");
  }
  return NextResponse.json({ ok: true });
}
