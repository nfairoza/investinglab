import { NextResponse } from "next/server";
import { clearFmpCache } from "@/lib/providers/fmp";

export const dynamic = "force-dynamic";

// POST → drop the server-side FMP response cache so the next data fetch is live.
// Useful when figures (e.g. day change) drift vs a broker before the 90s TTL.
export async function POST() {
  const cleared = clearFmpCache();
  return NextResponse.json({ ok: true, cleared });
}
