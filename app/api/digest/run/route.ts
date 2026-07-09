import { NextRequest, NextResponse } from "next/server";
import { runWeeklyDigest } from "@/lib/digest/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST/GET /api/digest/run — F2 weekly digest trigger. Protected by CRON_SECRET
// (same scheme as /api/cron/tick). Intended for a Sunday 5pm ET schedule, but
// safe to call anytime (idempotent per day via notification dedupe).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("key") === secret) return true;
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runWeeklyDigest();
  return NextResponse.json({ ok: true, at: new Date().toISOString(), result });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
