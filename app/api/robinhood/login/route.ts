import { NextRequest, NextResponse } from "next/server";
import { rhLogin } from "@/lib/robinhood/stocks";
import { getAdminClient } from "@/lib/supabase-data";

export const dynamic = "force-dynamic";

// POST { username, password } → starts the unofficial RH stocks login.
// Returns { ok } | { mfaRequired } | { workflowId } | { error }.
export async function POST(req: NextRequest) {
  if (!(await getAdminClient())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || !password) return NextResponse.json({ error: "username and password required" }, { status: 400 });
  try {
    const r = await rhLogin(username, password);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "login failed" }, { status: 500 });
  }
}
