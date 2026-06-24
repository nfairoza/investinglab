import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { addManualExecutiveRecord, type ManualExecutiveRecord } from "@/lib/power-trades/executive";

export const dynamic = "force-dynamic";

// POST /api/power-trades/manual-record — ADMIN ONLY. Add a notable executive
// 278-T transaction, manually entered, with a REQUIRED oge.gov source URL.
// Rejects entries without a valid source link or with disallowed personal data.
export async function POST(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: ManualExecutiveRecord;
  try {
    body = (await req.json()) as ManualExecutiveRecord;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await addManualExecutiveRecord(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
