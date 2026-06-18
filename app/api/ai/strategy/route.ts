import { NextRequest, NextResponse } from "next/server";
import { setRuntimeStrategy } from "@/lib/ai/runtime-key";
import { aiStatus } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

// POST { strategy: "smart" | "quality" | "economy" } -> set routing strategy for
// this session. Controls how the task router picks models per task.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const s = String(body?.strategy ?? "").toLowerCase();
  if (!["smart", "quality", "economy"].includes(s)) {
    return NextResponse.json({ error: "strategy must be smart|quality|economy" }, { status: 400 });
  }
  setRuntimeStrategy(s);
  return NextResponse.json(aiStatus());
}
