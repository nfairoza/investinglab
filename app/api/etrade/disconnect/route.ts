import { NextResponse } from "next/server";
import { clearAll } from "@/lib/etrade/token-store";

export const dynamic = "force-dynamic";

// POST /api/etrade/disconnect
// Clears all E*TRADE tokens and cached account data from server memory.
export async function POST() {
  clearAll();
  return NextResponse.json({ ok: true });
}
