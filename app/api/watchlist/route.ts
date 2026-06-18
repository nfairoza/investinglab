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
      // Newest first — add to the top of the list.
      db.data.watchlist.unshift({
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

// PATCH { order: string[] } — reorder the watchlist to match the given id order.
// Any ids not in the list keep their relative order at the end (safe for races).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const order: string[] = Array.isArray(body?.order) ? body.order : [];
  if (!order.length) return NextResponse.json({ error: "order array required" }, { status: 400 });
  const result = await withDbWrite((db) => {
    const byId = new Map(db.data.watchlist.map((w) => [w.id, w]));
    const reordered = order.map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w));
    const rest = db.data.watchlist.filter((w) => !order.includes(w.id));
    db.data.watchlist = [...reordered, ...rest];
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
