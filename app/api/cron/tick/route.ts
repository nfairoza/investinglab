import { NextRequest, NextResponse } from "next/server";
import { runDueJobs } from "@/lib/cron/registry";
import { JOBS } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // map build can take a bit on a per-symbol plan

// GET/POST /api/cron/tick — the single scheduler entry point. Call it on a short
// interval from ANY external trigger (Vercel cron, GitHub Actions, cron-job.org).
// Each registered job runs on its own cadence; this endpoint just runs whatever
// is due. Protected by CRON_SECRET (Bearer header or ?key= for triggers that
// can't set headers). When CRON_SECRET is unset (local dev), it runs open.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev convenience; set CRON_SECRET in prod
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("key") === secret) return true;
  // Vercel Cron sends this header on its scheduled invocations.
  if (req.headers.get("x-vercel-cron")) return true;
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await runDueJobs(JOBS);
  return NextResponse.json({ ok: true, at: new Date().toISOString(), results });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
