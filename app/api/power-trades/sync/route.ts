import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-data";
import { syncFmpCongress } from "@/lib/power-trades/sync";
import { syncSecForm4 } from "@/lib/power-trades/sec-form4";
import { syncExecutiveDirectory } from "@/lib/power-trades/executive";
import { isSourceActive } from "@/lib/power-trades/config";

export const dynamic = "force-dynamic";

// POST /api/power-trades/sync — admin-only. Runs the built+enabled sources into
// Supabase (FMP congressional + SEC Form 4 EDGAR). Pass ?source=fmp_congress or
// ?source=sec_form_4 to run just one. Intended for an admin button or a
// scheduled job — never on user render. Disabled sources no-op honestly.
export async function POST(req: NextRequest) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const which = req.nextUrl.searchParams.get("source");
  const results: Record<string, unknown> = {};
  let ingested = 0, normalized = 0, errors = 0;

  if (!which || which === "fmp_congress") {
    const r = await syncFmpCongress();
    results.fmp_congress = r;
    ingested += r.ingested; normalized += r.normalized; errors += r.errors;
  }
  if (!which || which === "sec_form_4") {
    const r = isSourceActive("sec_form_4")
      ? await syncSecForm4()
      : { ingested: 0, normalized: 0, errors: 0, note: "sec_form_4 disabled (set POWER_TRADES_ENABLE_SEC_FORM4=true + SEC_USER_AGENT)" };
    results.sec_form_4 = r;
    ingested += r.ingested; normalized += r.normalized; errors += r.errors;
  }
  if (!which || which === "executive_oge") {
    const r = isSourceActive("executive_oge")
      ? await syncExecutiveDirectory()
      : { ingested: 0, normalized: 0, errors: 0, note: "executive_oge disabled (set POWER_TRADES_ENABLE_EXECUTIVE=true)" };
    results.executive_oge = r;
    ingested += r.ingested; normalized += r.normalized; errors += r.errors;
  }

  return NextResponse.json({ ok: errors === 0, ingested, normalized, errors, sources: results });
}
