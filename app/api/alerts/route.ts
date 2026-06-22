import { NextRequest, NextResponse } from "next/server";
import { getDb, withDbWrite, newId, now } from "@/lib/db";
import type { Alert } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.data.alerts);
}

// Create an alert. Validates the params relevant to its type.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body?.symbol ?? "").toUpperCase().trim();
  const type = body?.type as Alert["type"];
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  if (!["price", "dayMove", "earnings", "score"].includes(type)) {
    return NextResponse.json({ error: "valid type required" }, { status: 400 });
  }

  // Type-specific validation.
  if (type === "price" && !(Number(body.price) > 0)) return NextResponse.json({ error: "price required" }, { status: 400 });
  if (type === "dayMove" && !(Number(body.movePct) > 0)) return NextResponse.json({ error: "movePct required" }, { status: 400 });
  if (type === "earnings" && !(Number(body.withinDays) >= 0)) return NextResponse.json({ error: "withinDays required" }, { status: 400 });
  if (type === "score" && !(Number(body.scoreValue) >= 0)) return NextResponse.json({ error: "scoreValue required" }, { status: 400 });

  const result = await withDbWrite((db) => {
    const alert: Alert = {
      id: newId(),
      symbol,
      type,
      direction: type === "price" ? (body.direction === "above" ? "above" : "below") : undefined,
      price: type === "price" ? Number(body.price) : undefined,
      movePct: type === "dayMove" ? Number(body.movePct) : undefined,
      withinDays: type === "earnings" ? Number(body.withinDays) : undefined,
      scoreOp: type === "score" ? (body.scoreOp === "above" ? "above" : "below") : undefined,
      scoreValue: type === "score" ? Number(body.scoreValue) : undefined,
      note: body.note ? String(body.note) : undefined,
      enabled: true,
      triggerCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    db.data.alerts.unshift(alert); // newest first
    return db.data.alerts;
  });
  return NextResponse.json(result);
}

// PATCH { id, enabled? , trigger?: { value, at } }
//  - enabled: toggle on/off
//  - trigger: record a firing (sets lastTriggeredAt/lastValue, bumps count)
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const result = await withDbWrite((db) => {
    const a = db.data.alerts.find((x) => x.id === id);
    if (!a) return null;
    if (typeof body.enabled === "boolean") a.enabled = body.enabled;
    if (body.trigger && typeof body.trigger.value === "number") {
      a.lastTriggeredAt = body.trigger.at ?? now();
      a.lastValue = body.trigger.value;
      a.triggerCount = (a.triggerCount ?? 0) + 1;
    }
    a.updatedAt = now();
    return a;
  });
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await withDbWrite((db) => {
    db.data.alerts = db.data.alerts.filter((a) => a.id !== id);
  });
  return NextResponse.json({ ok: true });
}
