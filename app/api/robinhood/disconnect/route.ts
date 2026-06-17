import { NextResponse } from "next/server";
import { clearRhStocks } from "@/lib/robinhood/stocks";

export const dynamic = "force-dynamic";

export async function POST() {
  clearRhStocks();
  return NextResponse.json({ ok: true });
}
