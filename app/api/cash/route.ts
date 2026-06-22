import { NextRequest, NextResponse } from "next/server";
import { getDb, withDbWrite, now } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.cash);
}

// PUT { amount } — set available cash manually.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }
  const result = await withDbWrite((db) => {
    db.data.cash = { amount: +amount.toFixed(2), source: "manual", updatedAt: now() };
    return db.data.cash;
  });
  return NextResponse.json(result);
}
