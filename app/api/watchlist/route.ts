import { NextRequest, NextResponse } from "next/server";
import { getDb, newId, now } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.watchlist);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

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
  db.write();
  return NextResponse.json(db.data.watchlist);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  db.data.watchlist = db.data.watchlist.filter((w) => w.id !== id);
  db.write();
  return NextResponse.json({ ok: true });
}
