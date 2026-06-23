import { NextResponse } from "next/server";
import { clearAll } from "@/lib/etrade/token-store";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST /api/etrade/disconnect
// Clears all E*TRADE tokens and cached account data from server memory.
export async function POST() {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  clearAll();
  return NextResponse.json({ ok: true });
}
