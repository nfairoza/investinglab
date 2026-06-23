import { NextResponse } from "next/server";
import { getCryptoHoldings, hasCryptoCreds, type RhCryptoCreds } from "@/lib/robinhood/crypto";
import { getUserClient } from "@/lib/supabase-data";
import { readBrokerConnection } from "@/lib/broker-store";

export const dynamic = "force-dynamic";

// GET /api/robinhood/crypto-sync — pull the CURRENT user's live crypto holdings
// from Robinhood's official API and store them in their own holdings rows
// (source "robinhood", assetType crypto).
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await readBrokerConnection(ctx, "robinhood");
  const creds = conn.data.crypto as RhCryptoCreds | undefined;
  if (!hasCryptoCreds(creds)) {
    return NextResponse.json({ error: "Add your Robinhood crypto API key + private key in Connect brokerage." }, { status: 400 });
  }

  try {
    const holdings = await getCryptoHoldings(creds!);
    const rows = holdings.map((h) => ({
      user_id: ctx.userId,
      symbol: h.symbol,
      shares: h.quantity,
      avg_cost: h.costBasis != null && h.quantity ? h.costBasis / h.quantity : 0,
      note: "Robinhood crypto",
      source: "robinhood",
      asset_type: "crypto",
      updated_at: new Date().toISOString(),
    }));

    // Replace only this user's robinhood-crypto rows.
    await ctx.supabase.from("holdings").delete().eq("source", "robinhood").eq("asset_type", "crypto");
    if (rows.length) await ctx.supabase.from("holdings").insert(rows);

    return NextResponse.json({ imported: rows.length });
  } catch (e: any) {
    const msg = e?.status === 401
      ? "Robinhood crypto auth failed — check your API key + private key."
      : (e instanceof Error ? e.message : "Crypto sync failed");
    return NextResponse.json({ error: msg }, { status: e?.status === 401 ? 401 : 500 });
  }
}
