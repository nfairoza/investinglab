import { NextRequest, NextResponse } from "next/server";
import { withDbWrite, newId, now, type Holding } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/robinhood/import  { rows: [{ symbol, shares, avgCost }] }
// Robinhood has no safe official API, so we import positions from a pasted/
// uploaded CSV (Robinhood → Account → Reports & statements, or holdings export).
// Replaces all robinhood-sourced rows; leaves manual + E*TRADE rows untouched.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: "No rows to import." }, { status: 400 });

  const incoming: Holding[] = rows
    .map((r: any) => ({
      id: newId(),
      symbol: String(r.symbol ?? "").toUpperCase().trim(),
      shares: Number(r.shares ?? 0),
      avgCost: Number(r.avgCost ?? 0),
      note: "Imported from Robinhood",
      source: "robinhood" as const,
      createdAt: now(),
      updatedAt: now(),
    }))
    .filter((h: Holding) => h.symbol && Number.isFinite(h.shares) && h.shares > 0);

  if (!incoming.length) return NextResponse.json({ error: "No valid rows (need symbol + shares)." }, { status: 400 });

  const result = await withDbWrite((db) => {
    const others = db.data.holdings.filter((h) => h.source !== "robinhood");
    db.data.holdings = [...others, ...incoming];
    return db.data.holdings;
  });

  return NextResponse.json({ imported: incoming.length, holdings: result });
}
