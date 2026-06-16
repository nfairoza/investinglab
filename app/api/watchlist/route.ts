import { NextRequest, NextResponse } from "next/server";
import { getDb, withDbWrite, newId, now } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.watchlist);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const result = await withDbWrite((db) => {
    const existing = db.data.watchlist.find((w) => w.symbol === symbol);
    if (existing) {
      existing.idealBuy = body.idealBuy != null ? Number(body.idealBuy) : existing.idealBuy;
      existing.note = body.note ?? existing.note;
      existing.updatedAt = now();
    } else {
      db.data.watchlist.push({
        id: newId(),
        symbol,
        idealBuy: body.idealBuy != null ? Number(body.idealBuy) : undefined,
        note: body.note ?? undefined,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    return db.data.watchlist;
  });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await withDbWrite((db) => {
    db.data.watchlist = db.data.watchlist.filter((w) => w.id !== id);
  });
  return NextResponse.json({ ok: true });
}
