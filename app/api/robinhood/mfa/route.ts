import { NextRequest, NextResponse } from "next/server";
import { rhSubmitMfa } from "@/lib/robinhood/stocks";

export const dynamic = "force-dynamic";

// POST { code } → submit the MFA/SMS/authenticator code to finish RH login.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  const r = await rhSubmitMfa(code);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
