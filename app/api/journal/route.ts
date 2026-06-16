import { NextRequest, NextResponse } from "next/server";
import { getDb, withDbWrite, newId, now } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.journal);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Patch existing entry (status toggle or result update)
  if (body?.id) {
    const result = await withDbWrite((db) => {
      const entry = db.data.journal.find((e) => e.id === body.id);
      if (!entry) return null;
      if (body.status !== undefined) entry.status = body.status;
      if (body.result1w !== undefined) entry.result1w = body.result1w;
      if (body.result1m !== undefined) entry.result1m = body.result1m;
      entry.updatedAt = now();
      return entry;
    });
    if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(result);
  }

  // New entry
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol || !body?.entryReason) {
    return NextResponse.json({ error: "symbol and entryReason required" }, { status: 400 });
  }
  const entry = {
    id: newId(),
    symbol,
    side: (body.side === "sell" ? "sell" : "buy") as "buy" | "sell",
    entryReason: String(body.entryReason),
    targetPrice: body.targetPrice != null ? Number(body.targetPrice) : undefined,
    stopLoss: body.stopLoss != null ? Number(body.stopLoss) : undefined,
    exitCriteria: body.exitCriteria ?? undefined,
    status: "open" as const,
    createdAt: now(),
    updatedAt: now(),
  };
  await withDbWrite((db) => {
    db.data.journal.push(entry);
  });
  return NextResponse.json(entry);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await withDbWrite((db) => {
    db.data.journal = db.data.journal.filter((e) => e.id !== id);
  });
  return NextResponse.json({ ok: true });
}
