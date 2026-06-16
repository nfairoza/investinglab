import { NextRequest, NextResponse } from "next/server";
import { getDb, withDbWrite, newId, now, type Holding } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/holdings → all holdings
export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.holdings);
}

// POST /api/holdings
// Body: { symbol, shares, avgCost, note?, source? }  → upsert by symbol
// Body: { replace: true, holdings: Holding[] }        → bulk replace E*TRADE rows
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Bulk replace from E*TRADE sync
  if (body?.replace === true && Array.isArray(body?.holdings)) {
    const incoming: Holding[] = (body.holdings as any[]).map((h) => ({
      id: h.id ?? newId(),
      symbol: String(h.symbol).toUpperCase(),
      shares: Number(h.shares),
      avgCost: Number(h.avgCost),
      note: h.note ?? undefined,
      source: "etrade",
      createdAt: h.createdAt ?? now(),
      updatedAt: now(),
    }));
    const incomingSymbols = new Set(incoming.map((h) => h.symbol));

    const result = await withDbWrite((db) => {
      // Keep manual entries, but drop any manual row whose symbol is now coming
      // from E*TRADE (E*TRADE is authoritative for owned positions) — avoids
      // duplicate rows for the same ticker.
      const manual = db.data.holdings.filter(
        (h) => h.source !== "etrade" && !incomingSymbols.has(h.symbol),
      );
      db.data.holdings = [...manual, ...incoming];
      return db.data.holdings;
    });
    return NextResponse.json(result);
  }

  // Single upsert
  const symbol = String(body?.symbol ?? "").toUpperCase();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const result = await withDbWrite((db) => {
    const existing = db.data.holdings.find((h) => h.symbol === symbol);
    if (existing) {
      existing.shares = Number(body.shares ?? existing.shares);
      existing.avgCost = Number(body.avgCost ?? existing.avgCost);
      existing.note = body.note ?? existing.note;
      existing.updatedAt = now();
    } else {
      db.data.holdings.push({
        id: newId(),
        symbol,
        shares: Number(body.shares ?? 0),
        avgCost: Number(body.avgCost ?? 0),
        note: body.note ?? undefined,
        source: body.source ?? "manual",
        createdAt: now(),
        updatedAt: now(),
      });
    }
    return db.data.holdings;
  });
  return NextResponse.json(result);
}

// DELETE /api/holdings?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await withDbWrite((db) => {
    db.data.holdings = db.data.holdings.filter((h) => h.id !== id);
  });
  return NextResponse.json({ ok: true });
}
