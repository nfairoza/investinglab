import { NextRequest, NextResponse } from "next/server";
import { plaidConfigured } from "@/lib/plaid";
import { getUserClient } from "@/lib/supabase-data";
import { runBackfill, readBackfillStatus } from "@/lib/insights/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/plaid/backfill — the current user's backfill status. Drives the
// /insights "Analyzing N months of history…" state (distinct from 'too little
// history' and 'pipeline error').
export async function GET() {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await readBackfillStatus(ctx.userId);
  return NextResponse.json({ status });
}

// POST /api/plaid/backfill — run (or re-run with { force: true }) the one-time
// full-history pull + immediate insight build for the current user. Idempotent;
// guarded against concurrent runs. Safe to call after a fresh link or as a
// one-time migration for an existing linked user.
export async function POST(req: NextRequest) {
  const ctx = await getUserClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const status = await runBackfill(ctx.userId, { force });
  return NextResponse.json({ status });
}
