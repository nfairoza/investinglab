import { NextResponse } from "next/server";
import { clearRhStocks } from "@/lib/robinhood/stocks";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  clearRhStocks();
  return NextResponse.json({ ok: true });
}
